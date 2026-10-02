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

export function pdfBoxToNormalizedRect(
  box: PdfBox,
  cropBox: PdfCropBox,
  rotation: number,
): NormalizedRect {
  const points = [
    pdfPointToNormalized({ x: box.x, y: box.y }, cropBox, rotation),
    pdfPointToNormalized(
      { x: box.x + box.width, y: box.y },
      cropBox,
      rotation,
    ),
    pdfPointToNormalized(
      { x: box.x, y: box.y + box.height },
      cropBox,
      rotation,
    ),
    pdfPointToNormalized(
      { x: box.x + box.width, y: box.y + box.height },
      cropBox,
      rotation,
    ),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = clamp(Math.min(...xs), 0, 1);
  const top = clamp(Math.min(...ys), 0, 1);
  const right = clamp(Math.max(...xs), left, 1);
  const bottom = clamp(Math.max(...ys), top, 1);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function pdfPointToNormalized(
  point: NormalizedPoint,
  cropBox: PdfCropBox,
  rotation: number,
): NormalizedPoint {
  const normalizedRotation = normalizePageRotation(rotation);
  if (normalizedRotation === 90) {
    return {
      x: (point.y - cropBox.y) / cropBox.height,
      y: (point.x - cropBox.x) / cropBox.width,
    };
  }
  if (normalizedRotation === 180) {
    return {
      x: (cropBox.x + cropBox.width - point.x) / cropBox.width,
      y: (point.y - cropBox.y) / cropBox.height,
    };
  }
  if (normalizedRotation === 270) {
    return {
      x: (cropBox.y + cropBox.height - point.y) / cropBox.height,
      y: (cropBox.x + cropBox.width - point.x) / cropBox.width,
    };
  }
  return {
    x: (point.x - cropBox.x) / cropBox.width,
    y: (cropBox.y + cropBox.height - point.y) / cropBox.height,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
