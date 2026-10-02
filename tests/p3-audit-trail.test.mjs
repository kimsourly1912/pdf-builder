import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
  plugins: [
    {
      name: "server-only-test-stub",
      resolveId(id) {
        return id === "server-only" ? "\0server-only" : null;
      },
      load(id) {
        return id === "\0server-only" ? "export {};" : null;
      },
    },
  ],
});
const audit = await vite.ssrLoadModule("/features/audit/audit.server.ts");

after(async () => vite.close());

test("creates bounded audit records with a validated request id", () => {
  const event = audit.createAuditEvent({
    request: new Request("https://example.com/api/templates", {
      headers: { "X-Request-Id": "request-1234" },
    }),
    ownerEmail: "owner@example.com",
    actorType: "owner",
    actorId: "owner@example.com",
    action: "template.created",
    targetType: "template",
    targetId: "template-1",
    metadata: { roleCount: 2 },
    createdAt: "2026-09-15T00:00:00.000Z",
  });

  assert.equal(event.requestId, "request-1234");
  assert.equal(event.action, "template.created");
  assert.deepEqual(JSON.parse(event.metadataJson), { roleCount: 2 });
  assert.equal(event.createdAt, "2026-09-15T00:00:00.000Z");
});

test("rejects unsafe correlation ids from durable audit records", () => {
  const event = audit.createAuditEvent({
    request: new Request("https://example.com", {
      headers: { "X-Request-Id": "unsafe request id" },
    }),
    ownerEmail: "owner@example.com",
    actorType: "owner",
    action: "template.deleted",
    targetType: "template",
    targetId: "template-1",
  });
  assert.equal(event.requestId, null);
});

test("migration enforces an append-only audit table", () => {
  const migration = read("drizzle/0014_p3_immutable_audit_trail.sql");
  assert.match(migration, /CREATE TABLE `audit_events`/u);
  assert.match(migration, /audit_events_prevent_update/u);
  assert.match(migration, /audit_events_prevent_delete/u);
  assert.match(migration, /RAISE\(ABORT, 'audit_events are append-only'\)/u);
  assert.doesNotMatch(migration, /REFERENCES/u);
});

test("critical writes record audit events in their database batches", () => {
  const sources = [
    read("app/api/templates/route.ts"),
    read("app/api/templates/[id]/route.ts"),
    read("app/api/accounts/route.ts"),
    read("app/api/accounts/[id]/assignments/route.ts"),
    read("app/api/fill/[token]/route.ts"),
    read("app/api/templates/[id]/links/route.ts"),
    read("app/api/resumes/route.ts"),
    read("app/api/resumes/[id]/route.ts"),
  ].join("\n");
  for (const action of [
    "template.created",
    "template.published",
    "account.created",
    "assignment.created",
    "link.regenerated",
    "link.revoked",
    "resume.uploaded",
    "submission.completed",
  ]) {
    assert.match(sources, new RegExp(action.replace(".", "\\."), "u"));
  }
  assert.doesNotMatch(sources, /metadata:.*token/iu);
  const archive = read("features/archive/archive.server.ts");
  assert.match(archive, /INSERT INTO audit_events/u);
  assert.match(archive, /`record\.\$\{action\}`/u);
  for (const action of ["archived", "restored", "deleted_permanently"])
    assert.match(archive, new RegExp(`"${action}"`, "u"));
});

test("owner activity API is scoped, bounded, and non-cacheable", () => {
  const route = read("app/api/audit-events/route.ts");
  assert.match(route, /requireRequestOwner\(request\)/u);
  assert.match(route, /eq\(auditEvents\.ownerEmail, ownerEmail\)/u);
  assert.match(route, /const MAX_LIMIT = 200/u);
  assert.match(route, /private, no-store/u);
});

test("activity UI uses the shared app shell and data table", () => {
  const shell = read("components/patterns/app-shell.tsx");
  const activity = read("features/audit/audit-log.tsx");
  assert.match(shell, /href: "\/activity"/u);
  assert.match(activity, /<AppShell/u);
  assert.match(activity, /<DataTable/u);
});
