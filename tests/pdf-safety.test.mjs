import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { PDFDocument } from "pdf-lib";
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

const coordinates = await vite.ssrLoadModule(
  "/features/templates/pdf-coordinates.ts",
);
const files = await vite.ssrLoadModule(
  "/features/templates/file-validation.ts",
);

test("maps normalized rectangles through crop offsets and every page rotation", () => {
  const cropBox = { x: 10, y: 20, width: 200, height: 100 };
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  assertBox(coordinates.normalizedRectToPdfBox(rect, cropBox, 0), {
    x: 30,
    y: 60,
    width: 60,
    height: 40,
  });
  assertBox(coordinates.normalizedRectToPdfBox(rect, cropBox, 90), {
    x: 50,
    y: 30,
    width: 80,
    height: 30,
  });
  assertBox(coordinates.normalizedRectToPdfBox(rect, cropBox, 180), {
    x: 130,
    y: 40,
    width: 60,
    height: 40,
  });
  assertBox(coordinates.normalizedRectToPdfBox(rect, cropBox, 270), {
    x: 90,
    y: 80,
    width: 80,
    height: 30,
  });

  for (const rotation of [0, 90, 180, 270]) {
    const pdfBox = coordinates.normalizedRectToPdfBox(
      rect,
      cropBox,
      rotation,
    );
    assertBox(
      coordinates.pdfBoxToNormalizedRect(pdfBox, cropBox, rotation),
      rect,
    );
  }
});

test("clamps PDF rectangles to the visible crop box", () => {
  const cropBox = { x: 10, y: 20, width: 200, height: 100 };
  assertBox(
    coordinates.pdfBoxToNormalizedRect(
      { x: -10, y: 0, width: 260, height: 150 },
      cropBox,
      0,
    ),
    { x: 0, y: 0, width: 1, height: 1 },
  );
});

function assertBox(actual, expected) {
  for (const key of ["x", "y", "width", "height"]) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.000001, `${key} differs`);
  }
}

test("inspects actual PDF structure instead of trusting MIME or extension", async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 100]);
  const valid = await document.save();
  assert.deepEqual(await files.inspectPdf(valid), { pageCount: 1 });
  assert.equal(
    await files.inspectPdf(new TextEncoder().encode("%PDF-1.7 fake %%EOF")),
    null,
  );
});

test("strips PNG metadata and rejects a mismatched declared type", () => {
  const png = makePng();
  const sanitized = files.sanitizeImage(png, "image/png");
  assert.ok(sanitized);
  assert.equal(sanitized.width, 1);
  assert.equal(sanitized.height, 1);
  assert.equal(new TextDecoder().decode(sanitized.bytes).includes("tEXt"), false);
  assert.equal(files.sanitizeImage(png, "image/jpeg"), null);
});

test("strips JPEG application metadata", () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x06, 0x45, 0x58, 0x49, 0x46,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9,
  ]);
  const sanitized = files.sanitizeImage(jpeg, "image/jpeg");
  assert.ok(sanitized);
  assert.equal(sanitized.width, 1);
  assert.equal(sanitized.bytes.includes(0xe1), false);
});

function makePng() {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return Uint8Array.from([
    ...signature,
    ...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...chunk("tEXt", [...new TextEncoder().encode("author=private")]),
    ...chunk("IDAT", []),
    ...chunk("IEND", []),
  ]);
}

function chunk(type, data) {
  const length = data.length;
  return [
    (length >>> 24) & 255,
    (length >>> 16) & 255,
    (length >>> 8) & 255,
    length & 255,
    ...new TextEncoder().encode(type),
    ...data,
    0, 0, 0, 0,
  ];
}
