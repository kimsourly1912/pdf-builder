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

const removal = await vite.ssrLoadModule(
  "/features/templates/template-removal.ts",
);

test("permanently deletes a template without assignments or submissions", () => {
  assert.equal(
    removal.templateRemovalDisposition({
      assignmentCount: 0,
      submissionCount: 0,
    }),
    "delete",
  );
});

test("archives a template that has immutable HR evidence", () => {
  assert.equal(
    removal.templateRemovalDisposition({
      assignmentCount: 1,
      submissionCount: 0,
    }),
    "archive",
  );
  assert.equal(
    removal.templateRemovalDisposition({
      assignmentCount: 0,
      submissionCount: 1,
    }),
    "archive",
  );
});
