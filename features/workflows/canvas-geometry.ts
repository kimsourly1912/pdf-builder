import type { WorkflowGraph } from "./workflow";

export type CanvasBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type Alignment =
  "left" | "center" | "right" | "top" | "middle" | "bottom";
export type Guide = {
  axis: "x" | "y";
  coordinate: number;
  start: number;
  end: number;
};

function bounds(boxes: CanvasBox[]) {
  const x = Math.min(...boxes.map((box) => box.x)),
    y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}
export function alignSelection(
  graph: WorkflowGraph,
  boxes: CanvasBox[],
  alignment: Alignment,
): WorkflowGraph {
  if (boxes.length < 2) return graph;
  const area = bounds(boxes),
    byId = new Map(boxes.map((box) => [box.id, box]));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const box = byId.get(node.id);
      if (!box) return node;
      const position = { ...node.position };
      if (alignment === "left") position.x = area.x;
      if (alignment === "center")
        position.x = area.x + (area.width - box.width) / 2;
      if (alignment === "right") position.x = area.x + area.width - box.width;
      if (alignment === "top") position.y = area.y;
      if (alignment === "middle")
        position.y = area.y + (area.height - box.height) / 2;
      if (alignment === "bottom")
        position.y = area.y + area.height - box.height;
      return { ...node, position };
    }),
  };
}
export function distributeSelection(
  graph: WorkflowGraph,
  boxes: CanvasBox[],
  axis: "x" | "y",
): WorkflowGraph {
  if (boxes.length < 3) return graph;
  const size = axis === "x" ? "width" : "height";
  const sorted = [...boxes].sort(
    (a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id),
  );
  const first = sorted[0],
    last = sorted.at(-1)!;
  // Preserve the first/last node, even when the selection currently overlaps.
  const gap =
    (last[axis] +
      last[size] -
      first[axis] -
      sorted.reduce((sum, box) => sum + box[size], 0)) /
    (sorted.length - 1);
  let position = first[axis];
  const positions = new Map(
    sorted.map((box) => {
      const entry = [box.id, position] as const;
      position += box[size] + gap;
      return entry;
    }),
  );
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      positions.has(node.id)
        ? {
            ...node,
            position: { ...node.position, [axis]: positions.get(node.id)! },
          }
        : node,
    ),
  };
}

// One shared delta keeps a dragged selection rigid. Threshold is supplied in
// flow coordinates so guides always activate within the same screen distance.
export function snapSelection(
  moving: CanvasBox[],
  stationary: CanvasBox[],
  threshold: number,
): { dx: number; dy: number; guides: Guide[] } {
  if (!moving.length) return { dx: 0, dy: 0, guides: [] };
  const area = bounds(moving),
    guides: Guide[] = [];
  const result = { dx: 0, dy: 0, guides };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height",
      other = axis === "x" ? "y" : "x",
      otherSize = axis === "x" ? "height" : "width";
    let best = threshold + Number.EPSILON;
    let match: { box: CanvasBox; coordinate: number; delta: number } | null =
      null;
    for (const box of stationary)
      for (const target of [
        box[axis],
        box[axis] + box[size] / 2,
        box[axis] + box[size],
      ]) {
        for (const anchor of [
          area[axis],
          area[axis] + area[size] / 2,
          area[axis] + area[size],
        ]) {
          const delta = target - anchor;
          if (Math.abs(delta) < best) {
            best = Math.abs(delta);
            match = { box, coordinate: target, delta };
          }
        }
      }
    if (match) {
      result[axis === "x" ? "dx" : "dy"] = match.delta;
      guides.push({
        axis,
        coordinate: match.coordinate,
        start: Math.min(area[other], match.box[other]) - 24,
        end:
          Math.max(
            area[other] + area[otherSize],
            match.box[other] + match.box[otherSize],
          ) + 24,
      });
    }
  }
  return result;
}

export function parseViewport(
  value: string | null,
): { x: number; y: number; zoom: number } | null {
  try {
    const viewport: unknown = JSON.parse(value ?? "null");
    if (!viewport || typeof viewport !== "object") return null;
    const { x, y, zoom } = viewport as Record<string, unknown>;
    return typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y) &&
      typeof zoom === "number" &&
      zoom >= 0.15 &&
      zoom <= 2
      ? { x, y, zoom }
      : null;
  } catch {
    return null;
  }
}
