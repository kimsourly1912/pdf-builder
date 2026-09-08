type EditorPoint = { x: number; y: number };

type PositionedAnnotation = {
  id: string;
  page: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  points?: EditorPoint[];
};

export function moveEditorAnnotations<T extends PositionedAnnotation>(options: {
  annotations: T[];
  selectedIds: string[];
  deltaX: number;
  deltaY: number;
  pageWidth: number;
  pageHeight: number;
  constrainAxis?: boolean;
}) {
  const {
    annotations,
    selectedIds,
    pageWidth,
    pageHeight,
    constrainAxis = false,
  } = options;
  const selected = new Set(selectedIds);
  const moving = annotations.filter((annotation) => selected.has(annotation.id));
  if (moving.length === 0) return annotations;

  let deltaX = options.deltaX;
  let deltaY = options.deltaY;
  if (constrainAxis) {
    if (Math.abs(deltaX * pageWidth) >= Math.abs(deltaY * pageHeight)) {
      deltaY = 0;
    } else {
      deltaX = 0;
    }
  }

  const bounds = moving.map(annotationBounds);
  const minimumX = Math.min(...bounds.map((bound) => bound.left));
  const minimumY = Math.min(...bounds.map((bound) => bound.top));
  const maximumX = Math.max(...bounds.map((bound) => bound.right));
  const maximumY = Math.max(...bounds.map((bound) => bound.bottom));
  const safeDeltaX = Math.min(1 - maximumX, Math.max(-minimumX, deltaX));
  const safeDeltaY = Math.min(1 - maximumY, Math.max(-minimumY, deltaY));

  return annotations.map((annotation) => {
    if (!selected.has(annotation.id)) return annotation;
    if (annotation.type === "drawing") {
      return {
        ...annotation,
        points: annotation.points?.map((point) => ({
          x: point.x + safeDeltaX,
          y: point.y + safeDeltaY,
        })),
      };
    }
    return {
      ...annotation,
      x: annotation.x + safeDeltaX,
      y: annotation.y + safeDeltaY,
    };
  });
}

export function reorderEditorAnnotations<T extends PositionedAnnotation>(options: {
  annotations: T[];
  selectedIds: string[];
  page: number;
  direction: "forward" | "backward";
  toEdge?: boolean;
}) {
  const { annotations, selectedIds, page, direction, toEdge = false } = options;
  const selected = new Set(selectedIds);
  const pageIndices = annotations.flatMap((annotation, index) =>
    annotation.page === page ? [index] : [],
  );
  const pageAnnotations = pageIndices.map((index) => annotations[index]);
  let reordered: T[];

  if (toEdge) {
    const selectedItems = pageAnnotations.filter((item) => selected.has(item.id));
    const otherItems = pageAnnotations.filter((item) => !selected.has(item.id));
    reordered =
      direction === "forward"
        ? [...otherItems, ...selectedItems]
        : [...selectedItems, ...otherItems];
  } else {
    reordered = [...pageAnnotations];
    if (direction === "forward") {
      for (let index = reordered.length - 2; index >= 0; index -= 1) {
        if (
          selected.has(reordered[index].id) &&
          !selected.has(reordered[index + 1].id)
        ) {
          [reordered[index], reordered[index + 1]] = [
            reordered[index + 1],
            reordered[index],
          ];
        }
      }
    } else {
      for (let index = 1; index < reordered.length; index += 1) {
        if (
          selected.has(reordered[index].id) &&
          !selected.has(reordered[index - 1].id)
        ) {
          [reordered[index], reordered[index - 1]] = [
            reordered[index - 1],
            reordered[index],
          ];
        }
      }
    }
  }

  const result = [...annotations];
  pageIndices.forEach((annotationIndex, index) => {
    result[annotationIndex] = reordered[index];
  });
  return result;
}

function annotationBounds(annotation: PositionedAnnotation) {
  if (annotation.type === "drawing" && annotation.points?.length) {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  }
  return {
    left: annotation.x,
    top: annotation.y,
    right: annotation.x + annotation.width,
    bottom: annotation.y + annotation.height,
  };
}
