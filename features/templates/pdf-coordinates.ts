export type PdfCropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type NormalizedRect = NormalizedPoint & {
  width: number;
  height: number;
};

export type PdfBox = PdfCropBox;

export function normalizePageRotation(value: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

export function normalizedPointToPdf(
  point: NormalizedPoint,
  cropBox: PdfCropBox,
  rotation: number,
): NormalizedPoint {
  const normalizedRotation = normalizePageRotation(rotation);
  const rotated = normalizedRotation === 90 || normalizedRotation === 270;
  const displayWidth = rotated ? cropBox.height : cropBox.width;
  const displayHeight = rotated ? cropBox.width : cropBox.height;
  const displayX = point.x * displayWidth;
  const displayY = point.y * displayHeight;

  if (normalizedRotation === 90) {
    return {
      x: cropBox.x + displayY,
      y: cropBox.y + displayX,
    };
  }
  if (normalizedRotation === 180) {
    return {
      x: cropBox.x + cropBox.width - displayX,
      y: cropBox.y + displayY,
    };
  }
  if (normalizedRotation === 270) {
    return {
      x: cropBox.x + cropBox.width - displayY,
      y: cropBox.y + cropBox.height - displayX,
    };
  }
  return {
    x: cropBox.x + displayX,
    y: cropBox.y + cropBox.height - displayY,
  };
}

export function normalizedRectToPdfBox(
  rect: NormalizedRect,
  cropBox: PdfCropBox,
  rotation: number,
): PdfBox {
  const points = [
    normalizedPointToPdf({ x: rect.x, y: rect.y }, cropBox, rotation),
    normalizedPointToPdf(
      { x: rect.x + rect.width, y: rect.y },
      cropBox,
      rotation,
    ),
    normalizedPointToPdf(
      { x: rect.x, y: rect.y + rect.height },
      cropBox,
      rotation,
    ),
    normalizedPointToPdf(
      { x: rect.x + rect.width, y: rect.y + rect.height },
      cropBox,
      rotation,
    ),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}
