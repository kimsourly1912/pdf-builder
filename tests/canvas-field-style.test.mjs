import assert from "node:assert/strict";
import test from "node:test";

import { getCanvasFieldRectStyle } from "../features/templates/canvas-field-style.ts";

test("maps normalized field rectangles to unchanged percentage styles", () => {
  assert.deepEqual(
    getCanvasFieldRectStyle({
      x: 0.125,
      y: 0.25,
      width: 0.5,
      height: 0.0625,
    }),
    {
      left: "12.5%",
      top: "25%",
      width: "50%",
      height: "6.25%",
    },
  );
});
