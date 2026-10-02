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

const shortcuts = await vite.ssrLoadModule(
  "/features/templates/editor-shortcuts.ts",
);

const annotation = (id, overrides = {}) => ({
  id,
  page: 1,
  type: "input",
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.05,
  ...overrides,
});

test("moves selected elements together and keeps them inside the page", () => {
  const moved = shortcuts.moveEditorAnnotations({
    annotations: [annotation("a", { x: 0.7 }), annotation("b", { x: 0.4 })],
    selectedIds: ["a", "b"],
    deltaX: 0.5,
    deltaY: 0.1,
    pageWidth: 600,
    pageHeight: 800,
  });
  assert.equal(moved[0].x, 0.8);
  assert.ok(Math.abs(moved[1].x - 0.5) < Number.EPSILON);
  assert.equal(moved[0].y, 0.2);
});

test("constrains shift-drag movement to its dominant axis", () => {
  const moved = shortcuts.moveEditorAnnotations({
    annotations: [annotation("a")],
    selectedIds: ["a"],
    deltaX: 0.1,
    deltaY: 0.02,
    pageWidth: 600,
    pageHeight: 800,
    constrainAxis: true,
  });
  assert.equal(moved[0].x, 0.2);
  assert.equal(moved[0].y, 0.1);
});

test("reorders selected elements within their page only", () => {
  const annotations = [
    annotation("a"),
    annotation("other-page", { page: 2 }),
    annotation("b"),
    annotation("c"),
  ];
  const forward = shortcuts.reorderEditorAnnotations({
    annotations,
    selectedIds: ["a"],
    page: 1,
    direction: "forward",
  });
  assert.deepEqual(forward.map((item) => item.id), ["b", "other-page", "a", "c"]);
  const front = shortcuts.reorderEditorAnnotations({
    annotations: forward,
    selectedIds: ["a"],
    page: 1,
    direction: "forward",
    toEdge: true,
  });
  assert.deepEqual(front.map((item) => item.id), ["b", "other-page", "c", "a"]);
});

test("resizes elements proportionally and keeps them inside the page", () => {
  const original = annotation("a", {
    x: 0.7,
    y: 0.7,
    width: 0.2,
    height: 0.1,
  });
  const resized = shortcuts.resizeEditorAnnotationProportionally({
    annotation: original,
    deltaX: 0.4,
    deltaY: 0.1,
    pageWidth: 600,
    pageHeight: 800,
  });
  const originalRatio =
    (original.width * 600) / (original.height * 800);
  const resizedRatio =
    (resized.width * 600) / (resized.height * 800);
  assert.ok(Math.abs(resizedRatio - originalRatio) < Number.EPSILON);
  assert.ok(resized.x + resized.width <= 1);
  assert.ok(resized.y + resized.height <= 1);
});

test("resizes drawing points from their top-left bound", () => {
  const resized = shortcuts.resizeEditorAnnotationProportionally({
    annotation: annotation("drawing", {
      type: "drawing",
      points: [
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.5 },
      ],
    }),
    deltaX: 0.2,
    deltaY: 0,
    pageWidth: 600,
    pageHeight: 800,
  });
  assert.deepEqual(resized.points[0], { x: 0.2, y: 0.3 });
  assert.ok(resized.points[1].x > 0.4);
  assert.ok(resized.points[1].y > 0.5);
});
