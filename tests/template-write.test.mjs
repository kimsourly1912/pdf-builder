import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => vite.close());

const templates = await vite.ssrLoadModule(
  "/features/templates/template-write.ts",
);

test("reads immutable version roles and ignores a mutated link fallback", () => {
  const rolesJson = JSON.stringify([
    { id: "employee", name: "Employee v1", color: "#475569" },
  ]);
  assert.deepEqual(
    templates.versionRole(rolesJson, "employee", {
      name: "Employee v2",
      color: "#000000",
    }),
    { id: "employee", name: "Employee v1", color: "#475569" },
  );
});

test("validates recipient role snapshots", () => {
  assert.equal(templates.validRecipientRoles([
    { id: "manager", name: "Manager", color: "#64748b" },
  ]), true);
  assert.equal(templates.validRecipientRoles([
    { id: "manager", name: "Manager", color: "blue" },
  ]), false);
});
