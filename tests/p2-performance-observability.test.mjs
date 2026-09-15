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
});
const reliability = await vite.ssrLoadModule(
  "/features/reliability/request-id.ts",
);

after(async () => vite.close());

test("redacts recipient bearer tokens and query strings from request logs", () => {
  assert.equal(
    reliability.requestPathForLog(
      "https://example.com/fill/private-token?email=person@example.com",
    ),
    "/fill/:token",
  );
  assert.equal(
    reliability.requestPathForLog(
      "https://example.com/api/fill/private-token/pdf?download=1",
    ),
    "/api/fill/:token/pdf",
  );
  assert.equal(
    reliability.requestPathForLog("https://example.com/api/templates?search=a"),
    "/api/templates",
  );
});

test("adds request timing and browser hardening headers", () => {
  const response = reliability.responseWithRequestId(
    Response.json({ ok: true }),
    "request-1234",
    12.34,
  );
  assert.equal(response.headers.get("Server-Timing"), "app;dur=12.3");
  assert.equal(response.headers.get("Referrer-Policy"), "same-origin");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
});

test("templates are enriched with bounded batch queries instead of N+1 queries", () => {
  const route = read("app/api/templates/route.ts");
  assert.match(
    route,
    /innerJoin\(templates, eq\(recipientLinks\.templateId, templates\.id\)\)/u,
  );
  assert.match(route, /groupBy\(submissions\.templateId\)/u);
  assert.match(route, /groupBy\(formAssignments\.templateId\)/u);
  assert.doesNotMatch(route, /inArray/u);
  assert.doesNotMatch(route, /templateRows\.map\(async/u);
});

test("adds indexes for the P2 list and join query paths", () => {
  const migration = read("drizzle/0013_p2_performance_observability.sql");
  assert.match(migration, /recipient_links_template_assignee_idx/u);
  assert.match(migration, /recipient_profiles_creator_created_idx/u);
  assert.match(migration, /form_assignments_user_assigned_idx/u);
  assert.match(migration, /submissions_link_submitted_idx/u);
});

test("worker logs safe path, status, and duration fields", () => {
  const worker = read("worker/index.ts");
  assert.match(worker, /requestPathForLog\(request\.url\)/u);
  assert.match(worker, /status: response\.status/u);
  assert.match(worker, /durationMs/u);
});
