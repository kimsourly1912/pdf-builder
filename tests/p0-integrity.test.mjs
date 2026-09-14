import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  COMPLETED_PDF_GENERATOR,
  assignedFillIdentifier,
  parseAssignedFillIdentifier,
  sha256Hex,
} from "../features/templates/submission-artifact.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(path, `${root}/`), "utf8");

test("assigned fill identifiers contain no stored bearer secret", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const identifier = assignedFillIdentifier(id);
  assert.equal(identifier, `assigned_${id}`);
  assert.equal(parseAssignedFillIdentifier(identifier), id);
  assert.equal(parseAssignedFillIdentifier("assigned_invalid"), null);
});

test("submission artifact checksum is deterministic", async () => {
  const bytes = new TextEncoder().encode("authoritative-pdf");
  assert.equal(
    await sha256Hex(bytes),
    "fb54324022c46a6d5a238450c10d9cf5448f9f0fc30c332117ccbd4992799e22",
  );
  assert.equal(COMPLETED_PDF_GENERATOR, "pdf-studio-server-v1");
});

test("submission route generates the official PDF on the server", () => {
  const route = read("app/api/fill/[token]/route.ts");
  assert.match(route, /buildAuthoritativeCompletedPdf/);
  assert.match(route, /completed_file_checksum/);
  assert.doesNotMatch(route, /formData\.get\("completedPdf"\)/);
});

test("assignment storage contains no plaintext access token", () => {
  const schema = read("db/schema.ts");
  const assignment = read("app/api/accounts/[id]/assignments/route.ts");
  const portal = read("app/api/portal/assignments/route.ts");
  assert.doesNotMatch(schema, /accessToken: text\("access_token"\)/);
  assert.doesNotMatch(assignment, /accessToken:/);
  assert.doesNotMatch(portal, /formAssignments\.accessToken/);
  assert.match(portal, /assignedFillIdentifier/);
});

test("migration preserves HR evidence and removes legacy bearer tokens", () => {
  const migration = read("drizzle/0011_p0_integrity_hardening.sql");
  assert.match(migration, /DROP COLUMN `access_token`/);
  assert.match(migration, /submissions_preserve_evidence_before_delete/);
  assert.match(migration, /users_preserve_assignments_before_delete/);
});

test("production builds cannot silently select development bindings", () => {
  const config = read("vite.config.ts");
  const wrangler = read("wrangler.jsonc");
  const deploy = read("scripts/deploy-production.mjs");
  assert.match(config, /command === "serve"/);
  assert.match(config, /\.\/wrangler\.jsonc/);
  assert.match(wrangler, /"main": "worker\/index\.ts"/);
  assert.match(deploy, /run\("npm", \["run", "build"\]\)/);
});
