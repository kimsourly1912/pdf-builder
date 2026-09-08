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

const fieldLayout = await vite.ssrLoadModule(
  "/features/templates/field-layout.ts",
);

test("single-line recipient controls use one consistent default size", () => {
  for (const type of ["input", "dropdown", "cambodia-address", "date"]) {
    assert.deepEqual(fieldLayout.getStandardFieldDimensions(type), {
      width: 200,
      height: 34,
    });
  }
});

test("larger field types stay compact while preserving their purpose", () => {
  assert.deepEqual(
    fieldLayout.getStandardFieldDimensions("image-placeholder"),
    { width: 200, height: 100 },
  );
  assert.deepEqual(
    fieldLayout.getStandardFieldDimensions("checkbox-group"),
    { width: 200, height: 104 },
  );
  assert.deepEqual(fieldLayout.getStandardFieldDimensions("checkbox"), {
    width: 22,
    height: 22,
  });
});

test("field dimensions normalize against the current PDF page", () => {
  assert.deepEqual(
    fieldLayout.getNormalizedStandardFieldDimensions("cambodia-address", {
      width: 612,
      height: 792,
    }),
    { width: 200 / 612, height: 34 / 792 },
  );
});

test("field icons scale with the rendered PDF while staying usable", () => {
  assert.equal(fieldLayout.getScaledFieldIconSize(0.35), 10);
  assert.equal(fieldLayout.getScaledFieldIconSize(1), 16);
  assert.equal(fieldLayout.getScaledFieldIconSize(2), 32);
  assert.equal(fieldLayout.getScaledFieldIconSize(3), 32);
  assert.equal(fieldLayout.getScaledFieldIconSize(2, "media"), 40);
});
