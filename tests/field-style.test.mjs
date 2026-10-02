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

const fieldStyle = await vite.ssrLoadModule(
  "/features/templates/field-style.ts",
);

test("new elements use consistent slate and 10px defaults", () => {
  assert.equal(fieldStyle.DEFAULT_ELEMENT_TEXT_COLOR, "#475569");
  assert.equal(fieldStyle.DEFAULT_ELEMENT_BORDER_COLOR, "#64748b");
  assert.equal(fieldStyle.DEFAULT_ELEMENT_FONT_SIZE, 10);
  assert.equal(fieldStyle.getDefaultElementColor("input"), "#475569");
});

test("highlight keeps its semantic yellow default", () => {
  assert.equal(fieldStyle.getDefaultElementColor("highlight"), "#facc15");
});
