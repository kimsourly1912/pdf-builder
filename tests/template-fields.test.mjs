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

after(async () => {
  await vite.close();
});

const templateFields = await vite.ssrLoadModule(
  "/features/templates/template-fields.ts",
);

test("recipient field types stay synchronized across client and server", () => {
  assert.equal(templateFields.isRecipientFieldType("cambodia-address"), true);
  assert.equal(templateFields.isRecipientFieldType("image-placeholder"), true);
  assert.equal(templateFields.isRecipientFieldType("text"), false);
});
