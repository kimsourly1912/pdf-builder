import "server-only";
import "regenerator-runtime/runtime";

import fontkit from "@pdf-lib/fontkit";
import khmerFontUrl from "@expo-google-fonts/noto-sans-khmer/400Regular/NotoSansKhmer_400Regular.ttf?url";
import { degrees, PDFDocument, rgb } from "pdf-lib";
import type { PDFFont, PDFPage, RGB } from "pdf-lib";

import { formatCambodiaAddress } from "@/features/gazetteer/gazetteer";
import type { GazetteerLanguage } from "@/features/gazetteer/gazetteer.types";
import {
  normalizedPointToPdf,
  normalizedRectToPdfBox,
} from "@/features/templates/pdf-coordinates";
import type {
  TemplateAnnotation,
  TemplatePageEntry,
} from "@/features/templates/template.types";

type SubmissionImage = {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
};

type FieldOption = {
  id: string;
  label: string;
};

type BuildCompletedPdfOptions = {
  sourcePdfBytes: Uint8Array<ArrayBuffer>;
  pageOrder: TemplatePageEntry[];
  annotations: TemplateAnnotation[];
  values: Record<string, unknown>;
  images: Map<string, SubmissionImage>;
  origin: string;
};

let fontBytesPromise: Promise<ArrayBuffer> | null = null;

export async function buildAuthoritativeCompletedPdf(
  options: BuildCompletedPdfOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = await PDFDocument.load(options.sourcePdfBytes.slice());
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  const font = await output.embedFont(await loadFontBytes(options.origin), {
    subset: false,
  });
  const copiedPages = await output.copyPages(
    source,
    options.pageOrder.map((entry) => entry.sourcePage - 1),
  );
  copiedPages.forEach((page, index) => {
    const extraRotation = options.pageOrder[index]?.rotation ?? 0;
    page.setRotation(
      degrees((page.getRotation().angle + extraRotation) % 360),
    );
    output.addPage(page);
  });

  const pages = output.getPages();
  for (const annotation of options.annotations) {
    const page = pages[annotation.page - 1];
    if (!page) continue;
    const cropBox = page.getCropBox();
    const rotation = page.getRotation().angle;
    const box = normalizedRectToPdfBox(annotation, cropBox, rotation);
    const color = parseColor(annotation.color);
    const value = options.values[annotation.id];
    const fontSize = Math.max(6, getNumber(annotation.fontSize, 12));

    if (annotation.formOutput === true && annotation.type !== "checkbox") {
      const rotated = rotation === 90 || rotation === 270;
      const displayWidth = rotated ? cropBox.height : cropBox.width;
      const displayHeight = rotated ? cropBox.width : cropBox.height;
      const width = annotation.width * displayWidth, height = annotation.height * displayHeight;
      if (annotation.type === "image-placeholder") {
        const image = options.images.get(annotation.id);
        if (image) {
          const embedded = image.contentType === "image/jpeg" ? await output.embedJpg(image.bytes) : await output.embedPng(image.bytes);
          const scale = Math.min(width / embedded.width, height / embedded.height);
          const imageWidth = embedded.width * scale, imageHeight = embedded.height * scale;
          const point = normalizedPointToPdf({ x: annotation.x + (width - imageWidth) / 2 / displayWidth, y: annotation.y + (height + imageHeight) / 2 / displayHeight }, cropBox, rotation);
          page.drawImage(embedded, { ...point, width: imageWidth, height: imageHeight, rotate: degrees(rotation) });
        }
      } else {
        const labels = getOptions(annotation.options);
        const text = annotation.type === "dropdown" ? labels.find((option) => option.id === value)?.label ?? "" : annotation.type === "checkbox-group" && Array.isArray(value) ? labels.filter((option) => value.includes(option.id)).map((option) => option.label).join(", ") : String(value ?? "");
        drawMappedAnswer({ page, font, text, annotation, cropBox, rotation, width, height, displayWidth, displayHeight, size: fontSize, color });
      }
      continue;
    }

    if (["input", "textarea", "date", "initials"].includes(annotation.type)) {
      drawText({
        page,
        font,
        text: String(value ?? ""),
        x: box.x + 4,
        topY:
          annotation.type === "textarea"
            ? box.y + box.height - 4
            : box.y + Math.max(fontSize + 2, (box.height + fontSize) / 2),
        size: fontSize,
        maxWidth: Math.max(4, box.width - 8),
        color,
      });
    } else if (annotation.type === "dropdown") {
      const label =
        getOptions(annotation.options).find((option) => option.id === value)
          ?.label ?? "";
      drawText({
        page,
        font,
        text: label,
        x: box.x + 4,
        topY: box.y + Math.max(fontSize + 2, (box.height + fontSize) / 2),
        size: fontSize,
        maxWidth: Math.max(4, box.width - 8),
        color,
      });
    } else if (annotation.type === "cambodia-address") {
      drawText({
        page,
        font,
        text: formatCambodiaAddress(
          value,
          getGazetteerLanguage(annotation.gazetteerLanguage),
        ),
        x: box.x + 4,
        topY: box.y + box.height - 4,
        size: fontSize,
        maxWidth: Math.max(4, box.width - 8),
        color,
      });
    } else if (
      (annotation.type === "checkbox" || annotation.type === "radio") &&
      value
    ) {
      if (annotation.type === "radio") {
        page.drawCircle({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          size: Math.min(box.width, box.height) * 0.28,
          color,
        });
      } else {
        page.drawLine({
          start: {
            x: box.x + box.width * 0.18,
            y: box.y + box.height * 0.48,
          },
          end: {
            x: box.x + box.width * 0.42,
            y: box.y + box.height * 0.22,
          },
          thickness: 2,
          color,
        });
        page.drawLine({
          start: {
            x: box.x + box.width * 0.42,
            y: box.y + box.height * 0.22,
          },
          end: {
            x: box.x + box.width * 0.84,
            y: box.y + box.height * 0.78,
          },
          thickness: 2,
          color,
        });
      }
    } else if (
      (annotation.type === "checkbox-group" ||
        annotation.type === "radio-group") &&
      Array.isArray(value)
    ) {
      const labels = getOptions(annotation.options)
        .filter((option) => value.includes(option.id))
        .map((option) => option.label)
        .join(", ");
      drawText({
        page,
        font,
        text: labels,
        x: box.x + 4,
        topY: box.y + Math.max(fontSize + 2, box.height - 4),
        size: fontSize,
        maxWidth: Math.max(4, box.width - 8),
        color,
      });
    } else if (annotation.type === "image-placeholder") {
      const image = options.images.get(annotation.id);
      if (image) {
        const embedded =
          image.contentType === "image/jpeg"
            ? await output.embedJpg(image.bytes)
            : await output.embedPng(image.bytes);
        page.drawImage(embedded, box);
      }
    } else if (annotation.type === "text") {
      drawText({
        page,
        font,
        text: getString(annotation.text, ""),
        x: box.x,
        topY: box.y + box.height,
        size: fontSize,
        maxWidth: Math.max(4, box.width),
        color,
      });
    } else if (annotation.type === "highlight") {
      page.drawRectangle({ ...box, color, opacity: 0.35 });
    } else if (annotation.type === "rectangle") {
      page.drawRectangle({
        ...box,
        borderColor: color,
        borderWidth: getNumber(annotation.strokeWidth, 2),
        opacity: 0,
      });
    } else if (annotation.type === "ellipse") {
      page.drawEllipse({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        xScale: box.width / 2,
        yScale: box.height / 2,
        borderColor: color,
        borderWidth: getNumber(annotation.strokeWidth, 2),
      });
    } else if (annotation.type === "line") {
      const up = annotation.lineDirection === "up";
      page.drawLine({
        start: { x: box.x, y: up ? box.y : box.y + box.height },
        end: {
          x: box.x + box.width,
          y: up ? box.y + box.height : box.y,
        },
        thickness: getNumber(annotation.strokeWidth, 2),
        color,
      });
    } else if (annotation.type === "drawing") {
      const points = getPoints(annotation.points);
      for (let index = 1; index < points.length; index += 1) {
        page.drawLine({
          start: normalizedPointToPdf(points[index - 1], cropBox, rotation),
          end: normalizedPointToPdf(points[index], cropBox, rotation),
          thickness: getNumber(annotation.strokeWidth, 2.5),
          color,
        });
      }
    } else if (annotation.type === "signature") {
      for (const stroke of getStrokes(annotation.strokes)) {
        for (let index = 1; index < stroke.length; index += 1) {
          page.drawLine({
            start: normalizedPointToPdf(
              {
                x: annotation.x + stroke[index - 1].x * annotation.width,
                y: annotation.y + stroke[index - 1].y * annotation.height,
              },
              cropBox,
              rotation,
            ),
            end: normalizedPointToPdf(
              {
                x: annotation.x + stroke[index].x * annotation.width,
                y: annotation.y + stroke[index].y * annotation.height,
              },
              cropBox,
              rotation,
            ),
            thickness: 1.8,
            color,
          });
        }
      }
    } else if (
      annotation.type === "image" &&
      typeof annotation.imageData === "string"
    ) {
      const bytes = dataUrlBytes(annotation.imageData);
      const embedded = annotation.imageData.startsWith("data:image/jpeg")
        ? await output.embedJpg(bytes)
        : await output.embedPng(bytes);
      page.drawImage(embedded, box);
    }
  }

  return (await output.save()) as Uint8Array<ArrayBuffer>;
}

async function loadFontBytes(origin: string): Promise<ArrayBuffer> {
  if (!fontBytesPromise) {
    const fontUrl = new URL(khmerFontUrl, origin);
    fontBytesPromise = fetch(fontUrl).then((response) => {
      if (!response.ok) {
        throw new Error("The PDF font asset could not be loaded.");
      }
      return response.arrayBuffer();
    });
    fontBytesPromise.catch(() => {
      fontBytesPromise = null;
    });
  }
  return fontBytesPromise;
}

function drawText(options: {
  page: PDFPage;
  font: PDFFont;
  text: string;
  x: number;
  topY: number;
  size: number;
  maxWidth: number;
  color: RGB;
}) {
  if (!options.text) return;
  options.page.drawText(options.text.normalize("NFC"), {
    x: options.x,
    y: options.topY - options.size,
    size: options.size,
    lineHeight: options.size * 1.35,
    maxWidth: options.maxWidth,
    font: options.font,
    color: options.color,
  });
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getGazetteerLanguage(value: unknown): GazetteerLanguage {
  return value === "km" || value === "en" || value === "bilingual"
    ? value
    : "bilingual";
}


function getOptions(value: unknown): FieldOption[] {
  return Array.isArray(value)
    ? value.filter(
        (option): option is FieldOption =>
          Boolean(option) &&
          typeof option === "object" &&
          typeof (option as FieldOption).id === "string" &&
          typeof (option as FieldOption).label === "string",
      )
    : [];
}

function getPoints(value: unknown): Array<{ x: number; y: number }> {
  return Array.isArray(value)
    ? value.filter(
        (point): point is { x: number; y: number } =>
          Boolean(point) &&
          typeof point === "object" &&
          typeof (point as { x?: unknown }).x === "number" &&
          typeof (point as { y?: unknown }).y === "number",
      )
    : [];
}

function getStrokes(
  value: unknown,
): Array<Array<{ x: number; y: number }>> {
  return Array.isArray(value)
    ? value.map(getPoints).filter((stroke) => stroke.length > 1)
    : [];
}

function parseColor(value: string): RGB {
  const hex = /^#[0-9a-f]{6}$/iu.test(value) ? value.slice(1) : "2563eb";
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function dataUrlBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(encoded);
  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  ) as Uint8Array<ArrayBuffer>;
}

function drawMappedAnswer(options: { page: PDFPage; font: PDFFont; text: string; annotation: TemplateAnnotation; cropBox: { x: number; y: number; width: number; height: number }; rotation: number; width: number; height: number; displayWidth: number; displayHeight: number; size: number; color: RGB }) {
  if (!options.text) return;
  const availableWidth = Math.max(1, options.width - 8), availableHeight = Math.max(1, options.height - 8);
  const graphemes = new Intl.Segmenter("km", { granularity: "grapheme" });
  const wrap = (size: number) => {
    const lines: string[] = [];
    for (const paragraph of options.text.normalize("NFC").split("\n")) {
      let line = "";
      for (const { segment } of graphemes.segment(paragraph)) {
        if (line && options.font.widthOfTextAtSize(line + segment, size) > availableWidth) { lines.push(line.trimEnd()); line = segment.trimStart(); } else line += segment;
      }
      lines.push(line);
    }
    return lines;
  };
  let size = options.size, lines = wrap(size);
  while (size > 6 && (lines.length * size * 1.2 > availableHeight || lines.some((line) => options.font.widthOfTextAtSize(line, size) > availableWidth))) { size = Math.max(6, size - 0.5); lines = wrap(size); }
  if (lines.length * size * 1.2 > availableHeight || lines.some((line) => options.font.widthOfTextAtSize(line, size) > availableWidth)) throw new Error("FORM_PDF_OVERFLOW");
  for (const [index, line] of lines.entries()) {
    const textWidth = options.font.widthOfTextAtSize(line, size);
    const offset = options.annotation.textAlign === "center" ? (availableWidth - textWidth) / 2 : options.annotation.textAlign === "right" ? availableWidth - textWidth : 0;
    const point = normalizedPointToPdf({ x: options.annotation.x + (4 + offset) / options.displayWidth, y: options.annotation.y + (4 + size + index * size * 1.2) / options.displayHeight }, options.cropBox, options.rotation);
    options.page.drawText(line, { ...point, size, font: options.font, color: options.color, rotate: degrees(options.rotation) });
  }
}
