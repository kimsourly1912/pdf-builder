import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  parseTelegramUpdate,
  validIntakeEmail,
  validIntakeName,
  validTelegramFilePath,
  invitationText,
} from "../features/telegram/telegram.ts";
import {
  activationToken,
  tokenHash,
  encryptActivation,
  decryptActivation,
} from "../features/telegram/activation.ts";
import {
  defaultGraph,
  graphIssues,
  parseGraph,
} from "../features/workflows/workflow.ts";
function db() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL("../drizzle/" + f, import.meta.url), "utf8"));
  return db;
}
const update = {
  update_id: 100,
  message: {
    message_id: 20,
    chat: { id: 123, type: "private" },
    from: { id: 123, is_bot: false },
    text: "/start",
  },
};
test("intake accepts only genuine private user message shapes", () => {
  assert(parseTelegramUpdate(update));
  assert.equal(
    parseTelegramUpdate({
      ...update,
      message: { ...update.message, chat: { id: 123, type: "group" } },
    }),
    null,
  );
  assert.equal(
    parseTelegramUpdate({
      ...update,
      message: { ...update.message, from: { id: 456 } },
    }),
    null,
  );
  assert.equal(parseTelegramUpdate({ ...update, update_id: 1.5 }), null);
  assert.equal(
    parseTelegramUpdate({
      ...update,
      message: { ...update.message, from: { id: 123, is_bot: true } },
    }),
    null,
  );
  assert.equal(parseTelegramUpdate({}), null);
});
test("candidate inputs and Telegram file download paths are bounded", () => {
  assert(validIntakeEmail("dara@gmail.com"));
  assert(!validIntakeEmail("not email"));
  assert(!validIntakeName("\nDara"));
  assert(!validIntakeName("x".repeat(121)));
  assert(validIntakeName("សុខ ដារ៉ា"));
  assert(validTelegramFilePath("documents/file_1.pdf"));
  for (const p of [
    "../../token",
    "/etc/passwd",
    "https://evil.test/steal",
    "foo?token=secret",
  ])
    assert(!validTelegramFilePath(p));
});
test("account invitations contain only approved message placeholders", () => {
  assert.equal(
    invitationText(
      "Hello {name}, {email}, {formCount} forms",
      "Dara",
      "dara@example.com",
      3,
    ),
    "Hello Dara, dara@example.com, 3 forms",
  );
});
test("activation secrets use random bearer tokens, hash lookup and authenticated encryption", async () => {
  const token = activationToken(),
    other = activationToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, other);
  const hash = await tokenHash(token);
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
  const encrypted = await encryptActivation(token, "test-secret");
  assert(!encrypted.includes(token));
  assert.equal(await decryptActivation(encrypted, "test-secret"), token);
  await assert.rejects(() => decryptActivation(encrypted, "wrong-key"));
});
test("Telegram invitation cannot bypass approval or form assignment", () => {
  const graph = defaultGraph();
  graph.nodes.find((n) => n.kind === "assign_forms").config.forms = [
    { templateId: "t", roleId: "r" },
  ];
  graph.nodes.push({
    id: "telegram",
    kind: "send_telegram",
    position: { x: 0, y: 0 },
    config: { message: "Hello {name}" },
  });
  graph.edges.find((e) => e.source === "assign").target = "telegram";
  graph.edges.push({
    id: "telegram-complete",
    source: "telegram",
    target: "done",
    outcome: "next",
  });
  assert.deepEqual(graphIssues(graph), []);
  const unsafe = structuredClone(graph);
  unsafe.edges.find((e) => e.source === "upload").target = "telegram";
  assert(graphIssues(unsafe).some((x) => x.includes("approved review")));
  assert(graphIssues(unsafe).some((x) => x.includes("Assign forms before")));
  graph.nodes.find((n) => n.id === "telegram").config.message = "x".repeat(
    2001,
  );
  assert.equal(parseGraph(graph), null);
});
test("Telegram duplicate update IDs cannot create a second inbox event", () => {
  const d = db();
  d.exec(
    "INSERT INTO telegram_updates(id,chat_id,payload_json,created_at)VALUES(100,'123','{}','t0')",
  );
  assert.throws(
    () =>
      d.exec(
        "INSERT INTO telegram_updates(id,chat_id,payload_json,created_at)VALUES(100,'123','{}','t0')",
      ),
    /UNIQUE/,
  );
  d.close();
});
test("intake side effects abort after lease replacement or expiry", () => {
  const d = db();
  d.exec(
    "INSERT INTO telegram_updates(id,chat_id,payload_json,status,lock_token,locked_until,created_at)VALUES(100,'123','{}','processing','lease','2026-10-02T12:10:00Z','t0')",
  );
  const guard = d.prepare("INSERT INTO telegram_update_guards VALUES(100,?,?)");
  assert.throws(
    () => guard.run("old", "2026-10-02T12:00:00Z"),
    /TELEGRAM_UPDATE_CHANGED/,
  );
  assert.throws(
    () => guard.run("lease", "2026-10-02T12:11:00Z"),
    /TELEGRAM_UPDATE_CHANGED/,
  );
  guard.run("lease", "2026-10-02T12:00:00Z");
  assert.equal(
    d.prepare("SELECT count(*) n FROM telegram_update_guards").get().n,
    0,
  );
  d.close();
});
function activationDatabase() {
  const d = db();
  d.exec(
    `INSERT INTO user(id,name,email,created_at,updated_at)VALUES('candidate-user','Dara','dara@example.com',0,0);INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at)VALUES('credential','candidate-user','credential','candidate-user','old-hash',0,0);INSERT INTO recipient_profiles(user_id,account_type,must_change_password,created_by_email,created_at,updated_at)VALUES('candidate-user','candidate',1,'owner@example.com','t0','t0');INSERT INTO account_activations(id,user_id,owner_email,token_hash,expires_at,created_at)VALUES('activation','candidate-user','owner@example.com','hash','2026-10-03T12:00:00Z','t0');`,
  );
  return d;
}
test("activation is single-use and expired or wrong-owner invitations cannot reset passwords", () => {
  const d = activationDatabase();
  const redeem = d.prepare("INSERT INTO activation_redemptions VALUES(?,?)");
  assert.throws(
    () => redeem.run("wrong-hash", "2026-10-02T12:00:00Z"),
    /ACTIVATION_UNAVAILABLE/,
  );
  assert.throws(
    () => redeem.run("hash", "2026-10-04T12:00:00Z"),
    /ACTIVATION_UNAVAILABLE/,
  );
  d.exec("BEGIN");
  redeem.run("hash", "2026-10-02T12:00:00Z");
  d.exec(
    "UPDATE account SET password='new-hash' WHERE id='credential';UPDATE account_activations SET used_at='used' WHERE id='activation';UPDATE recipient_profiles SET must_change_password=0 WHERE user_id='candidate-user';COMMIT",
  );
  assert.throws(
    () => redeem.run("hash", "2026-10-02T12:00:01Z"),
    /ACTIVATION_UNAVAILABLE/,
  );
  assert.equal(
    d.prepare("SELECT password FROM account WHERE id='credential'").get()
      .password,
    "new-hash",
  );
  d.close();
});
test("activation requires the eligible owner-created candidate account", () => {
  const d = activationDatabase();
  d.exec("UPDATE account_activations SET owner_email='other@example.com'");
  assert.throws(
    () =>
      d.exec(
        "INSERT INTO activation_redemptions VALUES('hash','2026-10-02T12:00:00Z')",
      ),
    /ACTIVATION_UNAVAILABLE/,
  );
  d.exec(
    "UPDATE account_activations SET owner_email='owner@example.com';UPDATE user SET banned=1",
  );
  assert.throws(
    () =>
      d.exec(
        "INSERT INTO activation_redemptions VALUES('hash','2026-10-02T12:00:00Z')",
      ),
    /ACTIVATION_UNAVAILABLE/,
  );
  d.close();
});
