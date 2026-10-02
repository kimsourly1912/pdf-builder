import type { CSSProperties } from "react";

type CanvasFieldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getCanvasFieldRectStyle(
  rect: CanvasFieldRect,
): CSSProperties {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}
