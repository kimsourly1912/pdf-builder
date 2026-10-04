import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = {
  DB: null,
  FILES: { async delete() {} },
  MANAGEMENT_EMAIL: "a@owner.test",
  TEST_DATA_RESET_ENABLED: "true",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  ENVIRONMENT: "development",
  AUTH_BOOTSTRAP_TOKEN: "test-reset-bootstrap",
};
globalThis.__telegramTestEnv = runtime;
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: {
    alias: {
      "@": root,
      "server-only": root + "/tests/helpers/server-only.mjs",
      "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs",
    },
  },
  server: { middlewareMode: true },
});
const service = await vite.ssrLoadModule("/features/test-data/reset.server.ts");
after(async () => {
  runtime.DB?.close();
  await vite.close();
});
function fixture() {
  runtime.DB?.close();
  runtime.DB = sqliteD1();
  runtime.TEST_DATA_RESET_ENABLED = "true";
  runtime.FILES = { async delete() {} };
  return runtime.DB.sqlite;
}
function insert(db, table, values) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const row = { ...values };
  for (const c of columns) {
    if (c.notnull && c.dflt_value == null && !(c.name in row))
      row[c.name] =
        c.type === "INTEGER"
          ? 1
          : c.name.endsWith("_json")
            ? "{}"
            : "2026-10-04T00:00:00.000Z";
  }
  const names = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table}(${names.join(",")}) VALUES(${names.map(() => "?").join(",")})`,
  ).run(...names.map((n) => row[n]));
}
function seed(db, p = "a") {
  const owner = p + "@owner.test",
    u = p + "user",
    t = p + "template",
    v = p + "version",
    l = p + "link",
    s = p + "submission",
    c = p + "candidate",
    r = p + "resume",
    w = p + "workflow",
    run = p + "run";
  insert(db, "user", {
    id: p + "admin",
    name: "TEST Admin",
    email: owner,
    role: "admin",
  });
  insert(db, "user", {
    id: u,
    name: "TEST Recipient",
    email: p + "@candidate.test",
  });
  insert(db, "recipient_profiles", {
    user_id: u,
    created_by_email: owner,
    account_type: "candidate",
  });
  insert(db, "account", {
    id: p + "auth",
    user_id: u,
    account_id: u,
    provider_id: "credential",
    password: "test-hash",
  });
  insert(db, "session", { id: p + "session", token: p + "token", user_id: u });
  insert(db, "templates", {
    id: t,
    owner_email: owner,
    name: "TEST Form",
    file_key: "templates/" + p + ".pdf",
    file_name: "TEST.pdf",
    annotations_json: "[]",
    page_order_json: "[1]",
    current_version_id: v,
  });
  insert(db, "template_versions", {
    id: v,
    template_id: t,
    version_number: 1,
    file_key: "templates/" + p + ".pdf",
    file_name: "TEST.pdf",
    annotations_json: "[]",
    page_order_json: "[1]",
    roles_json: "[]",
  });
  insert(db, "recipient_links", {
    id: l,
    template_id: t,
    template_version_id: v,
    assigned_user_id: u,
    role_id: "form_user",
    role_name: "Form user",
    role_color: "#2563eb",
    token_hash: p + "hash",
  });
  insert(db, "form_assignments", {
    id: p + "assignment",
    user_id: u,
    template_id: t,
    template_version_id: v,
    recipient_link_id: l,
    role_id: "form_user",
    role_name: "Form user",
    role_color: "#2563eb",
  });
  insert(db, "submissions", {
    id: s,
    template_id: t,
    template_version_id: v,
    recipient_link_id: l,
    values_json: JSON.stringify({
      name: "TEST Name",
      photo: {
        kind: "submission-image",
        storageKey: `forms/${t}/responses/${l}/test/photo.png`,
      },
    }),
    completed_file_key: `submissions/${p}.pdf`,
  });
  insert(db, "form_submission_artifacts", {
    submission_id: s,
    status: "ready",
    file_key: `submissions/${p}-generated.pdf`,
  });
  insert(db, "submission_reviews", {
    submission_id: s,
    owner_email: owner,
    status: "accepted",
    revision: "1",
    reviewed_by: owner,
  });
  insert(db, "form_response_drafts", {
    recipient_link_id: l,
    revision: "1",
    values_json: JSON.stringify({
      photo: {
        kind: "submission-image",
        storageKey: `forms/${t}/responses/${l}/test/draft.png`,
      },
    }),
  });
  insert(db, "candidates", {
    id: c,
    owner_email: owner,
    user_id: u,
    full_name: "TEST Candidate",
  });
  insert(db, "resumes", {
    id: r,
    owner_email: owner,
    candidate_id: c,
    file_key: `resumes/${p}.pdf`,
    file_name: "TEST CV.pdf",
    file_size: 10,
    content_type: "application/pdf",
    checksum: p + "sum",
    page_count: 1,
    source: "telegram",
    status: "uploaded",
  });
  insert(db, "candidate_progress", {
    candidate_id: c,
    owner_email: owner,
    primary_run_id: run,
    selected_resume_id: r,
  });
  insert(db, "resume_extractions", {
    id: p + "extraction",
    resume_id: r,
    version_number: 1,
    engine: "manual",
    status: "completed",
    fields_json: "{}",
    page_count: 1,
    scanned_page_count: 0,
    created_by_email: owner,
  });
  insert(db, "candidate_profile_versions", {
    id: p + "profile",
    owner_email: owner,
    candidate_id: c,
    resume_id: r,
    version_number: 1,
    profile_json: "{}",
    source: "manual",
    created_by_email: owner,
  });
  insert(db, "candidate_resume_links", {
    id: p + "cvlink",
    candidate_id: c,
    resume_id: r,
    link_type: "approved",
    created_by_email: owner,
  });
  insert(db, "workflows", {
    id: w,
    owner_email: owner,
    name: "TEST Workflow",
    draft_json: "{}",
  });
  insert(db, "workflow_runs", {
    id: run,
    workflow_id: w,
    owner_email: owner,
    workflow_name: "TEST",
    version: 1,
    resume_id: r,
    graph_json: "{}",
    context_json: JSON.stringify({ userId: u }),
    status: "completed",
    current_node_id: "done",
  });
  insert(db, "telegram_deliveries", {
    id: p + "delivery",
    owner_email: owner,
    run_id: run,
    node_id: "send",
    chat_id: p + "chat",
    status: "sent",
  });
  insert(db, "account_activations", {
    id: p + "activation",
    owner_email: owner,
    user_id: u,
    token_hash: p + "activationhash",
  });
  insert(db, "telegram_connections", {
    id: p + "connection",
    owner_email: owner,
    chat_id: p + "chat",
    candidate_id: c,
  });
  insert(db, "telegram_updates", {
    id: p === "a" ? 100 : 200,
    chat_id: p + "chat",
    payload_json: '{"private":"test"}',
    status: "completed",
  });
  insert(db, "telegram_intakes", {
    id: p + "intake",
    owner_email: owner,
    connection_id: p + "connection",
    candidate_id: c,
    resume_id: r,
    update_id: p === "a" ? 100 : 200,
  });
  insert(db, "ai_field_detection_runs", {
    id: p + "ai",
    owner_email: owner,
    file_key: `ai/${p}.pdf`,
    file_name: "TEST.pdf",
    file_size: 10,
    page_count: 1,
    status: "completed",
    model: "test",
  });
  insert(db, "archive_records", {
    id: p + "archive",
    owner_email: owner,
    entity_type: "resume",
    entity_id: r,
    label: "TEST",
    group_id: p,
    archived_by: owner,
  });
  insert(db, "audit_events", {
    id: p + "audit",
    owner_email: owner,
    actor_type: "owner",
    action: "test.seed",
    target_type: "candidate",
    target_id: c,
  });
  return { owner, u, t, v, l, s, c, r, w, run };
}
const choice = (scope, keepDefinitions = true) => ({ scope, keepDefinitions });
async function clear(owner, c) {
  const p = await service.previewTestDataReset(owner, c);
  assert.deepEqual(p.blockers, []);
  return service.executeTestDataReset(owner, c, p.revision, "DELETE TEST DATA");
}
async function status(p, code) {
  await assert.rejects(p, (e) => e instanceof Response && e.status === code);
}
test("full reset removes immutable history and private files, preserves admin and definitions, isolates owners", async () => {
  const db = fixture(),
    a = seed(db),
    deleted = [];
  seed(db, "b");
  runtime.FILES.delete = async (k) => deleted.push(k);
  assert.throws(
    () => db.exec("DELETE FROM submissions WHERE id='asubmission'"),
    /immutable/,
  );
  assert.throws(
    () => db.exec("DELETE FROM audit_events WHERE id='aaudit'"),
    /append-only/,
  );
  const result = await clear(a.owner, choice("all"));
  assert(result.removed > 20);
  assert(deleted.includes("resumes/a.pdf"));
  assert(deleted.includes("forms/atemplate/responses/alink/test/photo.png"));
  assert(deleted.includes("forms/atemplate/responses/alink/test/draft.png"));
  assert(!deleted.includes("templates/a.pdf"));
  assert(!deleted.some((k) => k.includes("/b.")));
  for (const table of [
    "candidates",
    "resumes",
    "workflow_runs",
    "form_assignments",
    "submissions",
    "recipient_profiles",
  ])
    assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 1);
  assert(db.prepare("SELECT id FROM user WHERE id='aadmin'").get());
  assert(db.prepare("SELECT id FROM templates WHERE id='atemplate'").get());
  assert(db.prepare("SELECT id FROM workflows WHERE id='aworkflow'").get());
  assert.equal(
    db.prepare("SELECT count(*) n FROM test_data_reset_guards").get().n,
    0,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM test_data_reset_targets").get().n,
    0,
  );
  assert.equal(
    db.prepare("SELECT payload_json FROM telegram_updates WHERE id=100").get()
      .payload_json,
    "{}",
  );
  assert.equal(
    db.prepare("SELECT payload_json FROM telegram_updates WHERE id=200").get()
      .payload_json,
    '{"private":"test"}',
  );
  assert.throws(
    () => db.exec("DELETE FROM submissions WHERE id='bsubmission'"),
    /immutable/,
  );
  assert.throws(() => db.exec("DELETE FROM audit_events"), /append-only/);
});
test("reset all can also remove definitions, archive, auth credentials and sessions", async () => {
  const db = fixture(),
    a = seed(db);
  const result = await clear(a.owner, choice("all", false));
  assert(result.filesDeleted >= 6);
  for (const t of [
    "templates",
    "template_versions",
    "workflows",
    "workflow_runs",
    "archive_records",
    "account",
    "session",
  ])
    assert.equal(db.prepare(`SELECT count(*) n FROM ${t}`).get().n, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM user").get().n, 1);
  assert.equal(
    db.prepare("SELECT action FROM audit_events").get().action,
    "test_data.reset",
  );
});
test("responses reset retains CV approval/account data and refreshes progress", async () => {
  const db = fixture(),
    a = seed(db);
  await clear(a.owner, choice("responses"));
  for (const t of ["user", "templates", "resumes", "candidates"])
    assert(db.prepare(`SELECT count(*) n FROM ${t}`).get().n > 0);
  for (const t of [
    "submissions",
    "form_assignments",
    "workflow_runs",
    "telegram_deliveries",
    "account_activations",
  ])
    assert.equal(db.prepare(`SELECT count(*) n FROM ${t}`).get().n, 0);
  assert.equal(
    db.prepare("SELECT primary_run_id FROM candidate_progress").get()
      .primary_run_id,
    null,
  );
});
test("candidate reset retains AI history, definitions and unrelated employee access", async () => {
  const db = fixture(),
    a = seed(db);
  insert(db, "user", {
    id: "employee",
    email: "employee@test.local",
    name: "TEST Employee",
  });
  insert(db, "recipient_profiles", {
    user_id: "employee",
    created_by_email: a.owner,
    account_type: "employee",
  });
  await clear(a.owner, choice("candidates"));
  assert(db.prepare("SELECT id FROM user WHERE id='employee'").get());
  assert.equal(
    db.prepare("SELECT count(*) n FROM ai_field_detection_runs").get().n,
    1,
  );
  assert.equal(db.prepare("SELECT count(*) n FROM candidates").get().n, 0);
});
test("disabled flag, confirmation, stale preview and active processing prevent deletion", async () => {
  const db = fixture(),
    a = seed(db);
  runtime.TEST_DATA_RESET_ENABLED = "false";
  await status(service.previewTestDataReset(a.owner, choice("all")), 403);
  runtime.TEST_DATA_RESET_ENABLED = "true";
  const p = await service.previewTestDataReset(a.owner, choice("all"));
  await status(
    service.executeTestDataReset(a.owner, choice("all"), p.revision, "wrong"),
    422,
  );
  db.exec("UPDATE resumes SET note='changed' WHERE id='aresume'");
  await status(
    service.executeTestDataReset(
      a.owner,
      choice("all"),
      p.revision,
      "DELETE TEST DATA",
    ),
    409,
  );
  db.exec("UPDATE workflow_runs SET status='running' WHERE id='arun'");
  const active = await service.previewTestDataReset(a.owner, choice("all"));
  assert(active.blockers.length);
  await status(
    service.executeTestDataReset(
      a.owner,
      choice("all"),
      active.revision,
      "DELETE TEST DATA",
    ),
    409,
  );
  assert(db.prepare("SELECT id FROM submissions WHERE id='asubmission'").get());
});
test("atomic recheck rolls back a reset if data changes after preflight", async () => {
  const db = fixture(),
    a = seed(db);
  const p = await service.previewTestDataReset(a.owner, choice("all"));
  const batch = runtime.DB.batch.bind(runtime.DB);
  runtime.DB.batch = async (statements) => {
    db.exec("UPDATE candidates SET full_name='new edit' WHERE id='acandidate'");
    return batch(statements);
  };
  await status(
    service.executeTestDataReset(
      a.owner,
      choice("all"),
      p.revision,
      "DELETE TEST DATA",
    ),
    409,
  );
  assert(db.prepare("SELECT id FROM submissions WHERE id='asubmission'").get());
  assert.equal(
    db.prepare("SELECT count(*) n FROM storage_cleanup_jobs").get().n,
    0,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM test_data_reset_guards").get().n,
    0,
  );
});
test("R2 failure leaves durable cleanup jobs after successful database reset", async () => {
  const db = fixture(),
    a = seed(db);
  runtime.FILES.delete = async () => {
    throw new Error("test R2 failure");
  };
  const r = await clear(a.owner, choice("all"));
  assert(r.filesPending > 0);
  assert.equal(db.prepare("SELECT count(*) n FROM candidates").get().n, 0);
  assert.equal(
    db.prepare("SELECT count(*) n FROM storage_cleanup_jobs").get().n,
    r.filesPending,
  );
});
test("shared references are protected and unreferenced automation runs can be cleared", async () => {
  const db = fixture(),
    a = seed(db);
  seed(db, "b");
  db.exec("UPDATE resumes SET candidate_id='acandidate' WHERE id='bresume'");
  const p = await service.previewTestDataReset(a.owner, choice("all"));
  assert(p.blockers.some((x) => x.includes("outside")));
  await status(
    service.executeTestDataReset(
      a.owner,
      choice("all"),
      p.revision,
      "DELETE TEST DATA",
    ),
    409,
  );
  db.exec("UPDATE resumes SET candidate_id='bcandidate' WHERE id='bresume'");
  insert(db, "workflow_runs", {
    id: "eligible",
    owner_email: a.owner,
    workflow_id: a.w,
    workflow_name: "TEST",
    version: 1,
    resume_id: "unlinked-test-resume",
    graph_json: "{}",
    context_json: "{}",
    status: "failed",
    current_node_id: "end",
  });
  await clear(a.owner, choice("history"));
  assert(!db.prepare("SELECT id FROM workflow_runs WHERE id='eligible'").get());
  assert(db.prepare("SELECT id FROM workflow_runs WHERE id='arun'").get());
});

test("reset API requires a real owner session, same origin, enablement and typed confirmation", async () => {
  fixture();
  const route = await vite.ssrLoadModule("/app/api/test-data/route.ts");
  const base = "http://localhost:5173";
  const forged = await route.GET(
    new Request(base + "/api/test-data", {
      headers: { "x-chatgpt-email": "a@owner.test" },
    }),
  );
  assert.equal(forged.status, 401);
  const auth = (await vite.ssrLoadModule("/lib/auth.ts")).getAuth();
  const signup = await auth.handler(
    new Request(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: base,
        "x-pdf-builder-bootstrap": runtime.AUTH_BOOTSTRAP_TOKEN,
      },
      body: JSON.stringify({
        name: "TEST Reset Owner",
        email: runtime.MANAGEMENT_EMAIL,
        password: "LocalTestReset!12345",
      }),
    }),
  );
  assert.equal(signup.status, 200);
  const cookie = signup.headers.get("set-cookie").split(";")[0];
  const request = (origin, body) =>
    new Request(base + "/api/test-data", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify(body),
    });
  const body = { action: "preview", scope: "all", keepDefinitions: true };
  assert.equal(
    (await route.POST(request("https://foreign.test", body))).status,
    403,
  );
  assert.equal((await route.POST(request(null, body))).status, 403);
  runtime.TEST_DATA_RESET_ENABLED = "false";
  assert.equal((await route.POST(request(base, body))).status, 403);
  runtime.TEST_DATA_RESET_ENABLED = "true";
  const preview = await route.POST(request(base, body));
  assert.equal(preview.status, 200);
  const revision = (await preview.json()).preview.revision;
  assert.equal(
    (
      await route.POST(
        request(base, {
          ...body,
          action: "reset",
          revision,
          confirmation: "DELETE",
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    runtime.DB.sqlite.prepare("SELECT count(*) n FROM user").get().n,
    1,
  );
});

test("cleanup progress-read failure still reports the committed reset", async () => {
  const db = fixture(),
    a = seed(db);
  const prepare = runtime.DB.prepare.bind(runtime.DB);
  runtime.DB.prepare = (query) => {
    if (query.startsWith("SELECT COUNT(*) remaining FROM storage_cleanup_jobs"))
      throw new Error("test progress read failure");
    return prepare(query);
  };
  const result = await clear(a.owner, choice("all"));
  assert.equal(result.filesPending, null);
  assert.equal(db.prepare("SELECT count(*) n FROM candidates").get().n, 0);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM audit_events WHERE action='test_data.reset'",
      )
      .get().n,
    1,
  );
});
