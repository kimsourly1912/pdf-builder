import assert from "node:assert/strict";
import test from "node:test";
import { buildResetPlan } from "../scripts/reset-plan.mjs";
import maintenance from "../scripts/reset-maintenance-worker.mjs";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";

function schema(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
  const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger'").all();
  const foreignKeys = Object.fromEntries(tables.map((table) => [
    table, db.prepare(`PRAGMA foreign_key_list("${table}")`).all().map((row) => row.table),
  ]));
  return { tables, triggers, foreignKeys };
}

test("production reset removes candidate/account and immutable evidence while restoring protections", async () => {
  const binding = sqliteD1();
  const db = binding.sqlite;
  try {
    db.exec(`INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-owner','Test owner','owner@example.test',1,1,1)`);
    db.exec(`INSERT INTO audit_events (id,owner_email,actor_type,action,target_type,target_id,created_at) VALUES ('event','owner@example.test','owner','test','user','test-owner','2026-10-03')`);
    assert.throws(() => db.exec("DELETE FROM audit_events"), /append-only/u);
    db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO d1_migrations VALUES (1, 'existing.sql')");
    const before = schema(db);
    const env = { DB: binding, PRODUCTION_RESET_TOKEN: "local-test-token" };
    const unauthorized = await maintenance.fetch(new Request("https://example.test/__reset/database", { method: "POST" }), env);
    assert.equal(unauthorized.status, 503);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM user").get().total, 1);
    const response = await maintenance.fetch(new Request("https://example.test/__reset/database", {
      method: "POST", headers: { Authorization: "Bearer local-test-token" },
    }), env);
    assert.equal(response.status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM d1_migrations").get().total, 1);
    for (const table of before.tables.filter((name) => name !== "d1_migrations")) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM "${table}"`).get().total, 0);
    }
    assert.deepEqual(schema(db), before);
    db.exec(`INSERT INTO audit_events (id,owner_email,actor_type,action,target_type,target_id,created_at) VALUES ('fresh','owner@example.test','owner','test','user','fresh-owner','2026-10-03')`);
    assert.throws(() => db.exec("DELETE FROM audit_events"), /append-only/u);
  } finally { binding.close(); }
});

test("reset planning refuses cyclic dependencies instead of partially clearing records", () => {
  assert.throws(() => buildResetPlan({
    tables: ["a", "b"], triggers: [], foreignKeys: { a: ["b"], b: ["a"] },
  }), /Cyclic/u);
});


test("maintenance file cleanup is authorized and deletes only listed keys", async () => {
  let deleted;
  const env = {
    PRODUCTION_RESET_TOKEN: "local-test-token",
    FILES: { async list() { return { objects: [{ key: "private/test.pdf" }] }; }, async delete(keys) { deleted = keys; } },
  };
  const response = await maintenance.fetch(new Request("https://example.test/__reset/files", {
    method: "POST", headers: { Authorization: "Bearer local-test-token" },
  }), env);
  assert.deepEqual(await response.json(), { deleted: 1 });
  assert.deepEqual(deleted, ["private/test.pdf"]);
});
