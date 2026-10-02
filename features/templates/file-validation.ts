export type ImageContentType = "image/jpeg" | "image/png";

export type SanitizedImage = {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: ImageContentType;
  extension: "jpg" | "png";
  width: number;
  height: number;
};

export type StoredSubmissionImage = {
  kind: "submission-image";
  storageKey: string;
  contentType: ImageContentType;
  width: number;
  height: number;
  size: number;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const PNG_ALLOWED_CHUNKS = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "sRGB",
  "gAMA",
  "cHRM",
]);

export function validatePdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const startLimit = Math.min(bytes.length - 5, 1024);
  let headerFound = false;
  for (let index = 0; index <= startLimit; index += 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x50 &&
      bytes[index + 2] === 0x44 &&
      bytes[index + 3] === 0x46 &&
      bytes[index + 4] === 0x2d
    ) {
      headerFound = true;
      break;
    }
  }
  if (!headerFound) return false;

  const endStart = Math.max(0, bytes.length - 2048);
  for (let index = bytes.length - 5; index >= endStart; index -= 1) {
    if (
      bytes[index] === 0x25 &&
      bytes[index + 1] === 0x25 &&
      bytes[index + 2] === 0x45 &&
      bytes[index + 3] === 0x4f &&
      bytes[index + 4] === 0x46
    ) {
      return true;
    }
  }
  return false;
}

export async function inspectPdf(bytes: Uint8Array<ArrayBuffer>) {
  if (!validatePdfBytes(bytes)) return null;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(bytes.slice(), {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    const pageCount = document.getPageCount();
    return pageCount > 0 ? { pageCount } : null;
  } catch {
    return null;
  }
}

export function sanitizeImage(
  source: Uint8Array<ArrayBuffer>,
  declaredType: string,
): SanitizedImage | null {
  if (source.length < 12 || source.length > MAX_IMAGE_BYTES) return null;
  if (isPng(source)) {
    if (declaredType !== "image/png") return null;
    return sanitizePng(source);
  }
  if (source[0] === 0xff && source[1] === 0xd8) {
    if (declaredType !== "image/jpeg") return null;
    return sanitizeJpeg(source);
  }
  return null;
}

export function isStoredSubmissionImage(
  value: unknown,
): value is StoredSubmissionImage {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const image = value as Partial<StoredSubmissionImage>;
  return (
    image.kind === "submission-image" &&
    typeof image.storageKey === "string" &&
    (image.contentType === "image/jpeg" || image.contentType === "image/png") &&
    typeof image.width === "number" &&
    typeof image.height === "number" &&
    typeof image.size === "number"
  );
}

function sanitizePng(source: Uint8Array<ArrayBuffer>): SanitizedImage | null {
  const chunks: Uint8Array<ArrayBuffer>[] = [
    source.slice(0, PNG_SIGNATURE.length) as Uint8Array<ArrayBuffer>,
  ];
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;

  while (offset + 12 <= source.length) {
    const length = readUint32(source, offset);
    const totalLength = 12 + length;
    if (length > MAX_IMAGE_BYTES || offset + totalLength > source.length) {
      return null;
    }
    const type = ascii(source, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/u.test(type)) return null;
    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== PNG_SIGNATURE.length) {
        return null;
      }
      width = readUint32(source, offset + 8);
      height = readUint32(source, offset + 12);
      sawHeader = true;
    } else if (type === "IDAT") {
      sawImageData = true;
    } else if (type === "IEND") {
      if (length !== 0) return null;
      sawEnd = true;
    }
    if (PNG_ALLOWED_CHUNKS.has(type)) {
      chunks.push(
        source.slice(offset, offset + totalLength) as Uint8Array<ArrayBuffer>,
      );
    }
    offset += totalLength;
    if (sawEnd) break;
  }

  if (!sawHeader || !sawImageData || !sawEnd || !validDimensions(width, height)) {
    return null;
  }
  return {
    bytes: concatenate(chunks),
    contentType: "image/png",
    extension: "png",
    width,
    height,
  };
}

function sanitizeJpeg(source: Uint8Array<ArrayBuffer>): SanitizedImage | null {
  const parts: Uint8Array<ArrayBuffer>[] = [
    source.slice(0, 2) as Uint8Array<ArrayBuffer>,
  ];
  let offset = 2;
  let width = 0;
  let height = 0;
  let sawScan = false;

  while (offset + 1 < source.length) {
    if (source[offset] !== 0xff) return null;
    while (source[offset] === 0xff) offset += 1;
    const marker = source[offset];
    const markerStart = offset - 1;
    offset += 1;

    if (marker === 0xd9) {
      parts.push(source.slice(markerStart, offset) as Uint8Array<ArrayBuffer>);
      break;
    }
    if (marker === 0xda) {
      const end = findJpegEnd(source);
      if (end < 0 || markerStart >= end) return null;
      parts.push(source.slice(markerStart, end + 2) as Uint8Array<ArrayBuffer>);
      sawScan = true;
      offset = end + 2;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(source.slice(markerStart, offset) as Uint8Array<ArrayBuffer>);
      continue;
    }
    if (offset + 2 > source.length) return null;
    const length = readUint16(source, offset);
    if (length < 2 || offset + length > source.length) return null;
    if (isStartOfFrame(marker)) {
      if (length < 7) return null;
      height = readUint16(source, offset + 3);
      width = readUint16(source, offset + 5);
    }
    const metadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) {
      parts.push(
        source.slice(markerStart, offset + length) as Uint8Array<ArrayBuffer>,
      );
    }
    offset += length;
  }

  if (!sawScan || !validDimensions(width, height)) return null;
  return {
    bytes: concatenate(parts),
    contentType: "image/jpeg",
    extension: "jpg",
    width,
    height,
  };
}

function validDimensions(width: number, height: number): boolean {
  return (
    width > 0 &&
    height > 0 &&
    width <= MAX_IMAGE_DIMENSION &&
    height <= MAX_IMAGE_DIMENSION &&
    width * height <= MAX_IMAGE_PIXELS
  );
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function isStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function findJpegEnd(bytes: Uint8Array): number {
  for (let index = bytes.length - 2; index >= 2; index -= 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) return index;
  }
  return -1;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] * 256 + bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function concatenate(
  chunks: Uint8Array<ArrayBuffer>[],
): Uint8Array<ArrayBuffer> {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
