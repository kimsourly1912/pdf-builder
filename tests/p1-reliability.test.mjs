import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
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
const requestReliability = await vite.ssrLoadModule(
  "/features/reliability/request-id.ts",
);

after(async () => vite.close());

test("preserves valid request ids and rejects unsafe values", () => {
  const supplied = new Headers({ "X-Request-Id": "client-request_123" });
  assert.equal(
    requestReliability.resolveRequestId(supplied),
    "client-request_123",
  );

  const generated = requestReliability.resolveRequestId(
    new Headers({ "X-Request-Id": "bad request id" }),
  );
  assert.match(generated, /^[0-9a-f-]{36}$/u);
});

test("adds request tracing and defensive response headers", () => {
  const response = requestReliability.responseWithRequestId(
    Response.json({ ok: true }),
    "request-1234",
  );
  assert.equal(response.headers.get("X-Request-Id"), "request-1234");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("API errors are explicitly non-cacheable", () => {
  const templateServer = read("features/templates/template.server.ts");
  assert.match(templateServer, /"Cache-Control": "no-store"/);
});

test("durably records failed R2 cleanup for scheduled retries", () => {
  const schema = read("db/schema.ts");
  const migration = read("drizzle/0012_p1_reliability_hardening.sql");
  const cleanup = read("features/storage/storage-cleanup.server.ts");
  const worker = read("worker/index.ts");
  assert.match(schema, /storageCleanupJobs/);
  assert.match(migration, /CREATE TABLE `storage_cleanup_jobs`/);
  assert.match(cleanup, /R2_DELETE_FAILED/);
  assert.match(worker, /processStorageCleanupJobs/);
  assert.match(worker, /async scheduled/);
});

test("verifies stored PDF checksums before owner download", () => {
  const submission = read("app/api/submissions/[id]/pdf/route.ts");
  const resume = read("app/api/resumes/[id]/download/route.ts");
  assert.match(submission, /completedFileChecksum/);
  assert.match(submission, /sha256Hex\(bytes\)/);
  assert.match(resume, /resume\.checksum/);
  assert.match(resume, /sha256Hex\(bytes\)/);
});

test("normal removal archives and permanent deletion queues file cleanup", () => {
  const archive = read("features/archive/archive.server.ts");
  assert.match(read("app/api/templates/[id]/route.ts"), /archiveEntity/);
  assert.match(read("app/api/resumes/[id]/route.ts"), /archiveEntity/);
  assert.match(archive, /INSERT OR IGNORE INTO storage_cleanup_jobs/);
  assert.match(archive, /archive_transition_guards/);
  assert.match(archive, /DELETE FROM/);
});
