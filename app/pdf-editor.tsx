"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckSquare2,
  CircleDot,
  Circle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  FileSearch,
  FileText,
  Eye,
  FolderOpen,
  Hand,
  Highlighter,
  ImagePlus,
  Keyboard,
  Link2,
  LoaderCircle,
  ListFilter,
  LockKeyhole,
  MapPinned,
  Maximize2,
  Minus,
  MousePointer2,
  PenLine,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Signature,
  Save,
  Square,
  TextCursorInput,
  TriangleAlert,
  Trash2,
  Type,
  Undo2,
  UploadCloud,
  Users,
  Wrench,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import khmerFontUrl from "@expo-google-fonts/noto-sans-khmer/400Regular/NotoSansKhmer_400Regular.ttf?url";
import type { RecipientRole } from "@/features/templates/template.types";
import type { LabelBinding } from "@/features/templates/label-binding";
import { createFieldKey, duplicateFieldKeys } from "@/features/templates/label-binding";
import {
  normalizedPointToPdf,
  normalizedRectToPdfBox,
} from "@/features/templates/pdf-coordinates";
import { Button } from "@/components/ui/button";
import { PdfExtractionDialog } from "@/features/extraction/pdf-extraction-dialog";
import { extractPdfContent } from "@/features/extraction/pdf-extraction";
import { CambodiaAddressField } from "@/features/gazetteer/cambodia-address-field";
import {
  formatCambodiaAddress,
  isAddressComplete,
  parseCambodiaAddress,
  truncateCambodiaAddress,
} from "@/features/gazetteer/gazetteer";
import type {
  PdfDocumentForExtraction,
  PdfExtractionResult,
} from "@/features/extraction/pdf-extraction";
import type {
  CambodiaAddressValue,
  GazetteerLanguage,
  GazetteerLevel,
} from "@/features/gazetteer/gazetteer.types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Tool =
  | "select"
  | "pan"
  | "text"
  | "highlight"
  | "pen"
  | "rectangle"
  | "input"
  | "dropdown"
  | "cambodia-address"
  | "checkbox"
  | "radio"
  | "checkbox-group"
  | "radio-group"
  | "signature"
  | "date"
  | "initials"
  | "ellipse"
  | "line"
  | "image"
  | "image-placeholder";
type Point = { x: number; y: number };
type FieldOption = { id: string; label: string; checked: boolean };
type AnnotationType =
  | "text"
  | "highlight"
  | "drawing"
  | "rectangle"
  | "input"
  | "dropdown"
  | "cambodia-address"
  | "checkbox"
  | "radio"
  | "checkbox-group"
  | "radio-group"
  | "signature"
  | "date"
  | "initials"
  | "ellipse"
  | "line"
  | "image"
  | "image-placeholder";
type Annotation = {
  id: string;
  page: number;
  type: AnnotationType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor?: string;
  text?: string;
  fontSize?: number;
  strokeWidth?: number;
  points?: Point[];
  strokes?: Point[][];
  checked?: boolean;
  lineDirection?: "down" | "up";
  imageData?: string;
  imageName?: string;
  label?: string;
  options?: FieldOption[];
  fieldName?: string;
  fieldKey?: string;
  labelBinding?: LabelBinding;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  validation?: "none" | "email" | "number" | "phone";
  tabIndex?: number;
  recipientRoleId?: string;
  address?: CambodiaAddressValue;
  gazetteerLanguage?: GazetteerLanguage;
  gazetteerLevel?: GazetteerLevel;
};
type EditorMode = "build" | "fill";
type PageEntry = {
  id: string;
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
};
type EditorDraft = {
  version: 1;
  fileName: string;
  fileBytes: ArrayBuffer;
  annotations: Annotation[];
  pageOrder: PageEntry[];
  savedAt: number;
};
type Interaction =
  | {
      mode: "move" | "resize";
      id: string;
      start: Point;
      origin: Annotation;
      before: Annotation[];
    }
  | {
      mode: "pan";
      clientX: number;
      clientY: number;
      scrollLeft: number;
      scrollTop: number;
    };
type PdfViewport = {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): [number, number];
};
type PdfTextRun = {
  id: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
};
type PdfPage = {
  rotate: number;
  getViewport(options: { scale: number; rotation?: number }): PdfViewport;
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void>; cancel: () => void };
  getTextContent(): Promise<{
    items: Array<{
      str?: string;
      width?: number;
      height?: number;
      transform?: number[];
    }>;
  }>;
};
type PdfDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};
type PinchGesture = {
  startDistance: number;
  startZoom: number;
  targetZoom: number;
  contentX: number;
  contentY: number;
  centerOffsetX: number;
  centerOffsetY: number;
};

const COLORS = ["#1d4ed8", "#e11d48", "#0f766e", "#facc15", "#111827"];
const RECIPIENT_COLORS = ["#2563eb", "#e11d48", "#0f766e", "#9333ea", "#ea580c"];
const KHMER_FONT_FAMILY = "PDF Studio Khmer";
const KHMER_REGRESSION_SAMPLES = ["សួស្តីបង", "រាត្រីសួស្តី"] as const;
const DRAFT_DATABASE = "pdf-studio-drafts";
const DRAFT_STORE = "drafts";
const ACTIVE_DRAFT_KEY = "active";
const DEFAULT_ZOOM = 1.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const FONT_SIZE_PRESETS = [8, 10, 12, 14, 16, 20, 24];
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 96;
const TOOL_SHORTCUT_ITEMS: Array<{
  key: string;
  label: string;
  tool: Tool;
}> = [
  { key: "A", label: "Select", tool: "select" },
  { key: "H", label: "Pan document", tool: "pan" },
  { key: "T", label: "Add text", tool: "text" },
  { key: "G", label: "Highlight", tool: "highlight" },
  { key: "P", label: "Draw", tool: "pen" },
  { key: "R", label: "Rectangle", tool: "rectangle" },
  { key: "I", label: "Text input", tool: "input" },
  { key: "V", label: "Dropdown", tool: "dropdown" },
  { key: "K", label: "Cambodia address", tool: "cambodia-address" },
  { key: "C", label: "Checkbox", tool: "checkbox" },
  { key: "O", label: "Radio button", tool: "radio" },
  { key: "B", label: "Checkbox group", tool: "checkbox-group" },
  { key: "Q", label: "Radio group", tool: "radio-group" },
  { key: "S", label: "Signature", tool: "signature" },
  { key: "D", label: "Date", tool: "date" },
  { key: "N", label: "Initials", tool: "initials" },
  { key: "E", label: "Ellipse", tool: "ellipse" },
  { key: "L", label: "Line", tool: "line" },
  { key: "U", label: "Upload image", tool: "image" },
  { key: "M", label: "Image placeholder", tool: "image-placeholder" },
];
const TOOL_SHORTCUTS = Object.fromEntries(
  TOOL_SHORTCUT_ITEMS.map((item) => [item.key.toLowerCase(), item.tool]),
) as Record<string, Tool>;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function clampFontSize(value: number) {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}

function pointDistance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function isSquareField(type: AnnotationType) {
  return type === "checkbox" || type === "radio";
}

function isInteractivePdfField(type: AnnotationType) {
  return (
    type === "input" ||
    type === "dropdown" ||
    type === "cambodia-address" ||
    type === "date" ||
    type === "initials" ||
    type === "checkbox" ||
    type === "radio"
  );
}

function isAssignableTemplateField(type: AnnotationType) {
  return (
    isInteractivePdfField(type) ||
    type === "checkbox-group" ||
    type === "radio-group" ||
    type === "image-placeholder"
  );
}

function createPdfFieldName(annotation: Annotation) {
  const customName = annotation.fieldName
    ?.trim()
    .replaceAll(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const safeId = annotation.id.replaceAll(/[^a-zA-Z0-9]/g, "");
  return `${customName || `pdfstudio_${annotation.type}`}_${annotation.page}_${safeId}`;
}

function cloneAnnotations(annotations: Annotation[]) {
  return annotations.map((annotation) => ({
    ...annotation,
    points: annotation.points?.map((point) => ({ ...point })),
    strokes: annotation.strokes?.map((stroke) =>
      stroke.map((point) => ({ ...point })),
    ),
    options: annotation.options?.map((option) => ({ ...option })),
    address: annotation.address
      ? parseCambodiaAddress(annotation.address)
      : undefined,
    labelBinding: annotation.labelBinding
      ? { ...annotation.labelBinding, rect: { ...annotation.labelBinding.rect } }
      : undefined,
  }));
}

function createPageEntry(sourcePage: number): PageEntry {
  return {
    id: createAnnotationId(),
    sourcePage,
    rotation: 0,
  };
}

function createPdfTextRuns(
  items: Array<{ str?: string; width?: number; height?: number; transform?: number[] }>,
  viewport: PdfViewport,
) {
  return items.flatMap<PdfTextRun>((item, index) => {
    const text = item.str?.trim();
    const transform = item.transform;
    if (!text || !transform || transform.length < 6) return [];
    const x = transform[4];
    const baseline = transform[5];
    const width = Math.max(item.width ?? 0, 1);
    const height = Math.max(item.height ?? Math.abs(transform[3]) ?? 0, 1);
    const corners = [
      viewport.convertToViewportPoint(x, baseline),
      viewport.convertToViewportPoint(x + width, baseline),
      viewport.convertToViewportPoint(x, baseline + height),
      viewport.convertToViewportPoint(x + width, baseline + height),
    ];
    const xs = corners.map(([pointX]) => pointX);
    const ys = corners.map(([, pointY]) => pointY);
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const right = Math.min(viewport.width, Math.max(...xs));
    const bottom = Math.min(viewport.height, Math.max(...ys));
    return [{
      id: `${index}-${text}`,
      text,
      rect: {
        x: left / viewport.width,
        y: top / viewport.height,
        width: Math.max(2, right - left) / viewport.width,
        height: Math.max(2, bottom - top) / viewport.height,
      },
    }];
  });
}

function openDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DRAFT_DATABASE, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE)) {
        request.result.createObjectStore(DRAFT_STORE);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function writeDraft(draft: EditorDraft) {
  const database = await openDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).put(draft, ACTIVE_DRAFT_KEY);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
  });
  database.close();
}

async function readDraft() {
  const database = await openDraftDatabase();
  const draft = await new Promise<EditorDraft | null>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, "readonly");
    const request = transaction.objectStore(DRAFT_STORE).get(ACTIVE_DRAFT_KEY);
    request.addEventListener("success", () =>
      resolve((request.result as EditorDraft | undefined) ?? null),
    );
    request.addEventListener("error", () => reject(request.error));
  });
  database.close();
  return draft;
}

async function removeDraft() {
  const database = await openDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).delete(ACTIVE_DRAFT_KEY);
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
  });
  database.close();
}

function fieldValueIsValid(annotation: Annotation) {
  const value = annotation.text?.trim() ?? "";
  if (annotation.required) {
    if (
      (annotation.type === "checkbox" || annotation.type === "radio") &&
      !annotation.checked
    ) {
      return false;
    }
    if (
      annotation.type === "dropdown" &&
      !annotation.options?.some((option) => option.checked)
    ) {
      return false;
    }
    if (
      annotation.type === "cambodia-address" &&
      !isAddressComplete(
        annotation.address,
        annotation.gazetteerLevel ?? "village",
      )
    ) {
      return false;
    }
    if (
      (annotation.type === "checkbox-group" ||
        annotation.type === "radio-group") &&
      !annotation.options?.some((option) => option.checked)
    ) {
      return false;
    }
    if (
      ["input", "date", "initials"].includes(annotation.type) &&
      !value
    ) {
      return false;
    }
  }
  if (!value || !annotation.validation || annotation.validation === "none") {
    return true;
  }
  if (annotation.validation === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
  }
  if (annotation.validation === "number") {
    return Number.isFinite(Number(value));
  }
  return /^[+()\d\s.-]{6,}$/u.test(value);
}

function currentDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateValue(value?: string) {
  if (!value) return "Choose a date";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function dataUrlToBytes(dataUrl: string) {
  const encoded = dataUrl.split(",")[1] ?? "";
  const binary = window.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

let khmerFontBytesPromise: Promise<Uint8Array<ArrayBuffer>> | null = null;
let khmerBrowserFontPromise: Promise<void> | null = null;

function loadKhmerFontBytes() {
  if (!khmerFontBytesPromise) {
    khmerFontBytesPromise = fetch(khmerFontUrl).then(async (response) => {
      if (!response.ok) throw new Error("Khmer font could not be loaded");
      return new Uint8Array(
        await response.arrayBuffer(),
      ) as Uint8Array<ArrayBuffer>;
    });
  }
  return khmerFontBytesPromise;
}

function containsKhmer(value?: string) {
  return /[\u1780-\u17ff\u19e0-\u19ff]/u.test(value ?? "");
}

function annotationContainsKhmer(annotation: Annotation) {
  return (
    containsKhmer(annotation.text) ||
    containsKhmer(annotation.label) ||
    containsKhmer(formatCambodiaAddress(annotation.address, "km")) ||
    annotation.options?.some((option) => containsKhmer(option.label)) === true
  );
}

function loadKhmerBrowserFont() {
  if (typeof FontFace === "undefined" || !window.document.fonts) {
    return Promise.resolve();
  }
  if (!khmerBrowserFontPromise) {
    const khmerFont = new FontFace(
      KHMER_FONT_FAMILY,
      `url(${khmerFontUrl})`,
      { style: "normal", weight: "400" },
    );
    khmerBrowserFontPromise = khmerFont
      .load()
      .then(async (loadedFont) => {
        window.document.fonts.add(loadedFont);
        const sampleFaces = await Promise.all(
          KHMER_REGRESSION_SAMPLES.map((sample) =>
            window.document.fonts.load(
              `400 16px "${KHMER_FONT_FAMILY}"`,
              sample,
            ),
          ),
        );
        if (sampleFaces.some((faces) => faces.length === 0)) {
          throw new Error("Khmer shaping font did not become available");
        }
      })
      .catch((error) => {
        khmerBrowserFontPromise = null;
        throw error;
      });
  }
  return khmerBrowserFontPromise;
}

async function renderKhmerTextImage(options: {
  text: string;
  fontSize: number;
  color: string;
  maxWidth: number;
}) {
  const { text, fontSize, color, maxWidth } = options;
  const normalizedText = text.normalize("NFC");
  const scale = 3;
  const horizontalPadding = 2;
  const verticalPadding = Math.max(2, fontSize * 0.28);
  const lineHeight = fontSize * 1.55;
  const lines = normalizedText.split("\n");
  const width = Math.max(1, maxWidth);
  const height = Math.max(
    1,
    verticalPadding * 2 + lineHeight * Math.max(1, lines.length),
  );
  await loadKhmerBrowserFont();
  await window.document.fonts.load(
    `400 ${fontSize}px "${KHMER_FONT_FAMILY}"`,
    normalizedText,
  );
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.scale(scale, scale);
  context.font = `400 ${fontSize}px "${KHMER_FONT_FAMILY}"`;
  context.fillStyle = color;
  context.direction = "ltr";
  context.fontKerning = "normal";
  context.textBaseline = "alphabetic";
  lines.forEach((line, index) => {
    context.fillText(
      line,
      horizontalPadding,
      verticalPadding + fontSize + lineHeight * index,
    );
  });
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

function bytesToDataUrl(bytes: Uint8Array<ArrayBuffer>, mimeType: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () =>
      reject(new Error("Font data could not be encoded")),
    );
    reader.readAsDataURL(new Blob([bytes], { type: mimeType }));
  });
}

function createAnnotationId() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16)).join("-");
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function annotationToSvg(
  annotation: Annotation,
  pageWidth: number,
  pageHeight: number,
) {
  const x = annotation.x * pageWidth;
  const y = annotation.y * pageHeight;
  const width = annotation.width * pageWidth;
  const height = annotation.height * pageHeight;
  const color = escapeHtml(annotation.color);
  const strokeWidth = annotation.strokeWidth ?? 2;

  if (
    (annotation.type === "image" || annotation.type === "image-placeholder") &&
    annotation.imageData
  ) {
    return `<image href="${escapeHtml(annotation.imageData)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
  }

  if (annotation.type === "image-placeholder") {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="7 5"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" fill="#475569" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="14">${escapeHtml(annotation.label ?? "Upload image")}</text>`;
  }

  if (
    annotation.type === "text" ||
    annotation.type === "initials"
  ) {
    const fontSize = annotation.fontSize ?? 16;
    const lines = (annotation.text ?? "").split("\n");
    return `<text x="${x}" y="${y + fontSize}" fill="${color}" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="${fontSize}">${lines
      .map(
        (line, index) =>
          `<tspan x="${x}" dy="${index === 0 ? 0 : fontSize * 1.2}">${escapeHtml(line)}</tspan>`,
      )
      .join("")}</text>`;
  }
  if (annotation.type === "date") {
    const fontSize = annotation.fontSize ?? 14;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="white" stroke="#94a3b8"/><text x="${x + 9}" y="${y + height / 2}" dominant-baseline="middle" fill="${color}" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="${fontSize}">${escapeHtml(formatDateValue(annotation.text))}</text><text x="${x + width - 20}" y="${y + height / 2}" dominant-baseline="middle" fill="#64748b" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="13">▣</text>`;
  }
  if (annotation.type === "input") {
    const fontSize = annotation.fontSize ?? 14;
    const borderColor = escapeHtml(annotation.borderColor ?? "#64748b");
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="${borderColor}"/><text x="${x + 5}" y="${y + height / 2}" dominant-baseline="middle" fill="${color}" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="${fontSize}">${escapeHtml(annotation.text ?? "")}</text>`;
  }
  if (annotation.type === "dropdown") {
    const fontSize = annotation.fontSize ?? 14;
    const borderColor = escapeHtml(annotation.borderColor ?? "#64748b");
    const selected = annotation.options?.find((option) => option.checked)?.label;
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="white" stroke="${borderColor}"/><text x="${x + 7}" y="${y + height / 2}" dominant-baseline="middle" fill="${color}" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="${fontSize}">${escapeHtml(selected ?? annotation.label ?? "Select an option")}</text><text x="${x + width - 16}" y="${y + height / 2}" dominant-baseline="middle" fill="#64748b" font-size="12">▼</text>`;
  }
  if (annotation.type === "cambodia-address") {
    const fontSize = annotation.fontSize ?? 11;
    const borderColor = escapeHtml(annotation.borderColor ?? "#64748b");
    const address = formatCambodiaAddress(
      annotation.address,
      annotation.gazetteerLanguage ?? "bilingual",
    );
    const lines = [address || annotation.label || "Cambodia address"];
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="white" stroke="${borderColor}"/><text x="${x + 7}" y="${y + fontSize + 5}" fill="${color}" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="${fontSize}">${lines.map((line, index) => `<tspan x="${x + 7}" dy="${index === 0 ? 0 : fontSize * 1.45}">${escapeHtml(line)}</tspan>`).join("")}</text>`;
  }
  if (annotation.type === "highlight") {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" opacity="0.35"/>`;
  }
  if (annotation.type === "rectangle") {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>`;
  }
  if (annotation.type === "ellipse") {
    return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"/>`;
  }
  if (annotation.type === "line") {
    const firstY = annotation.lineDirection === "up" ? y + height : y;
    const secondY = annotation.lineDirection === "up" ? y : y + height;
    return `<line x1="${x}" y1="${firstY}" x2="${x + width}" y2="${secondY}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
  }
  if (annotation.type === "drawing") {
    const points = (annotation.points ?? [])
      .map((point) => `${point.x * pageWidth},${point.y * pageHeight}`)
      .join(" ");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (annotation.type === "checkbox") {
    const check = annotation.checked
      ? `<polyline points="${x + width * 0.18},${y + height * 0.52} ${x + width * 0.42},${y + height * 0.78} ${x + width * 0.84},${y + height * 0.22}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
      : "";
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="${color}" stroke-width="1.5"/>${check}`;
  }
  if (annotation.type === "radio") {
    const radius = Math.min(width, height) / 2;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const dot = annotation.checked
      ? `<circle cx="${centerX}" cy="${centerY}" r="${radius * 0.48}" fill="${color}"/>`
      : "";
    return `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="white" stroke="${color}" stroke-width="1.5"/>${dot}`;
  }
  if (
    annotation.type === "checkbox-group" ||
    annotation.type === "radio-group"
  ) {
    const options = annotation.options ?? [];
    const labelSize = Math.max(12, Math.min(16, height * 0.16));
    const rowHeight = Math.max(18, (height - labelSize - 8) / Math.max(1, options.length));
    const controlSize = Math.min(14, rowHeight * 0.58);
    const rows = options
      .map((option, index) => {
        const centerY = y + labelSize + 10 + rowHeight * index + rowHeight / 2;
        const controlX = x + 5;
        const controlY = centerY - controlSize / 2;
        const mark = option.checked
          ? annotation.type === "radio-group"
            ? `<circle cx="${controlX + controlSize / 2}" cy="${centerY}" r="${controlSize * 0.28}" fill="${color}"/>`
            : `<polyline points="${controlX + controlSize * 0.18},${centerY} ${controlX + controlSize * 0.42},${centerY + controlSize * 0.25} ${controlX + controlSize * 0.84},${centerY - controlSize * 0.27}" fill="none" stroke="${color}" stroke-width="2"/>`
          : "";
        const control = annotation.type === "radio-group"
          ? `<circle cx="${controlX + controlSize / 2}" cy="${centerY}" r="${controlSize / 2}" fill="white" stroke="${color}"/>`
          : `<rect x="${controlX}" y="${controlY}" width="${controlSize}" height="${controlSize}" fill="white" stroke="${color}"/>`;
        return `${control}${mark}<text x="${controlX + controlSize + 7}" y="${centerY}" dominant-baseline="middle" fill="#1e293b" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="13">${escapeHtml(option.label)}</text>`;
      })
      .join("");
    return `<text x="${x + 5}" y="${y + labelSize}" fill="#0f172a" font-family="PDF Studio Khmer, Arial, sans-serif" font-size="${labelSize}" font-weight="600">${escapeHtml(annotation.label ?? "Options")}</text>${rows}`;
  }
  if (annotation.type === "signature") {
    return (annotation.strokes ?? [])
      .map((stroke) => {
        const points = stroke
          .map(
            (point) =>
              `${x + point.x * width},${y + point.y * height}`,
          )
          .join(" ");
        return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      })
      .join("");
  }
  return "";
}

function ToolButton(props: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const accessibleLabel = props.shortcut
    ? `${props.label} (${props.shortcut})`
    : props.label;

  return (
    <Tooltip>
      <TooltipTrigger
        asChild
      >
        <Button
          type="button"
          variant={props.active ? "default" : "ghost"}
          size="icon-sm"
          aria-label={accessibleLabel}
          title={accessibleLabel}
          disabled={props.disabled}
          onClick={props.onClick}
          className={
            props.active
              ? "size-10 shrink-0 bg-blue-600 text-white hover:bg-blue-700 sm:size-8"
              : "size-10 shrink-0 text-slate-600 sm:size-8"
          }
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        <span className="flex items-center gap-2">
          {props.label}
          {props.shortcut && (
            <kbd className="rounded border border-slate-300 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 shadow-sm">
              {props.shortcut}
            </kbd>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function ColorControl(props: {
  value: string;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  const { value, compact, onChange } = props;
  const sizeClass = compact ? "size-5" : "size-7";

  return (
    <div className="flex items-center gap-2">
      {COLORS.map((item) => (
        <button
          key={item}
          type="button"
          aria-label={`Use ${item} color`}
          aria-pressed={value === item}
          onClick={() => onChange(item)}
          className={`${sizeClass} shrink-0 rounded-full border-2 transition ${
            value === item
              ? "scale-110 border-slate-900"
              : "border-white ring-1 ring-slate-200"
          }`}
          style={{ backgroundColor: item }}
        />
      ))}
      <label
        title="Choose a custom color"
        aria-label="Choose a custom color"
        className={`${sizeClass} relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-white text-white shadow-sm ring-1 ring-slate-300`}
        style={{ backgroundColor: value }}
      >
        <Pipette className={compact ? "size-3" : "size-3.5"} />
        <input
          type="color"
          value={value}
          aria-label="Custom color"
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function FontSizeControl(props: {
  value: number;
  compact?: boolean;
  onChange: (value: number) => void;
}) {
  const { value, compact, onChange } = props;

  return (
    <div className={compact ? "w-80 shrink-0" : "w-full"}>
      <div className="flex flex-wrap items-center gap-1">
        {FONT_SIZE_PRESETS.map((size) => (
          <button
            key={size}
            type="button"
            aria-label={`Set font size to ${size} points`}
            aria-pressed={value === size}
            onClick={() => onChange(size)}
            className={`h-7 min-w-8 rounded-md border px-1.5 text-[11px] font-semibold transition ${
              value === size
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
            }`}
          >
            {size}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="range"
          min={MIN_FONT_SIZE}
          max="72"
          value={value}
          aria-label="Custom font size"
          onChange={(event) =>
            onChange(clampFontSize(Number(event.target.value)))
          }
          className="min-w-0 flex-1 accent-blue-600"
        />
        <label className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-slate-500">
          <span className="sr-only">Exact font size</span>
          <input
            type="number"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step="1"
            value={value}
            onChange={(event) => {
              if (!event.target.value) return;
              onChange(clampFontSize(Number(event.target.value)));
            }}
            className="h-7 w-14 rounded-md border border-slate-200 bg-white px-1.5 text-right text-xs font-semibold tabular-nums text-slate-700 outline-none focus:border-blue-500"
          />
          pt
        </label>
      </div>
    </div>
  );
}

function GroupFieldEditor(props: {
  annotation: Annotation;
  compact?: boolean;
  onChange: (changes: Partial<Annotation>) => void;
}) {
  const options = props.annotation.options ?? [];
  const isRadio =
    props.annotation.type === "radio-group" ||
    props.annotation.type === "dropdown";

  function updateOption(optionId: string, changes: Partial<FieldOption>) {
    props.onChange({
      options: options.map((option) =>
        option.id === optionId ? { ...option, ...changes } : option,
      ),
    });
  }

  function toggleOption(optionId: string) {
    props.onChange({
      options: options.map((option) => ({
        ...option,
        checked:
          option.id === optionId
            ? isRadio
              ? true
              : !option.checked
            : isRadio
              ? false
              : option.checked,
      })),
    });
  }

  function addOption() {
    props.onChange({
      options: [
        ...options,
        {
          id: createAnnotationId(),
          label: `Option ${options.length + 1}`,
          checked: false,
        },
      ],
    });
  }

  function removeOption(optionId: string) {
    if (options.length <= 1) return;
    props.onChange({ options: options.filter((option) => option.id !== optionId) });
  }

  return (
    <div
      className={
        props.compact
          ? "flex min-w-max items-center gap-2"
          : "space-y-3"
      }
    >
      <input
        aria-label="Group label"
        value={props.annotation.label ?? ""}
        onChange={(event) => props.onChange({ label: event.target.value })}
        placeholder="Group label"
        className={`${props.compact ? "h-8 w-40" : "h-9 w-full"} rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-blue-500`}
      />
      <div className={props.compact ? "flex items-center gap-2" : "space-y-2"}>
        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`${option.checked ? "Unselect" : "Select"} ${option.label}`}
              onClick={() => toggleOption(option.id)}
              className={`flex size-5 shrink-0 items-center justify-center border-2 bg-white ${isRadio ? "rounded-full" : "rounded"}`}
              style={{ borderColor: props.annotation.color }}
            >
              {option.checked &&
                (isRadio ? (
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: props.annotation.color }}
                  />
                ) : (
                  <Check
                    className="size-4"
                    style={{ color: props.annotation.color }}
                    strokeWidth={3}
                  />
                ))}
            </button>
            <input
              aria-label="Option label"
              value={option.label}
              onChange={(event) =>
                updateOption(option.id, { label: event.target.value })
              }
              className={`${props.compact ? "h-8 w-28" : "h-8 min-w-0 flex-1"} rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-blue-500`}
            />
            <button
              type="button"
              aria-label={`Remove ${option.label}`}
              disabled={options.length <= 1}
              onClick={() => removeOption(option.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
            >
              <Minus className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addOption}>
        <Plus className="size-3.5" /> Add option
      </Button>
    </div>
  );
}

function GazetteerFieldEditor(props: {
  annotation: Annotation;
  compact?: boolean;
  onChange: (changes: Partial<Annotation>) => void;
}) {
  return (
    <div className={props.compact ? "flex min-w-max items-center gap-2" : "space-y-3"}>
      <label className="block text-[11px] font-semibold text-slate-500">
        <span className={props.compact ? "sr-only" : "block"}>Field label</span>
        <input
          aria-label="Cambodia address field label"
          value={props.annotation.label ?? ""}
          onChange={(event) => props.onChange({ label: event.target.value })}
          placeholder="Cambodia address"
          className={`${props.compact ? "h-8 w-40" : "mt-1 h-8 w-full"} rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-blue-500`}
        />
      </label>
      <label className="block text-[11px] font-semibold text-slate-500">
        <span className={props.compact ? "sr-only" : "block"}>Display language</span>
        <select
          aria-label="Cambodia address display language"
          value={props.annotation.gazetteerLanguage ?? "bilingual"}
          onChange={(event) => {
            const gazetteerLanguage = event.target.value as GazetteerLanguage;
            props.onChange({
              gazetteerLanguage,
              text: formatCambodiaAddress(
                props.annotation.address,
                gazetteerLanguage,
              ),
            });
          }}
          className={`${props.compact ? "h-8 w-32" : "mt-1 h-8 w-full"} rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-blue-500`}
        >
          <option value="bilingual">Khmer + English</option>
          <option value="km">Khmer</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-slate-500">
        <span className={props.compact ? "sr-only" : "block"}>Address depth</span>
        <select
          aria-label="Cambodia address depth"
          value={props.annotation.gazetteerLevel ?? "village"}
          onChange={(event) => {
            const gazetteerLevel = event.target.value as GazetteerLevel;
            const address = truncateCambodiaAddress(
              props.annotation.address,
              gazetteerLevel,
            );
            props.onChange({
              gazetteerLevel,
              address,
              text: formatCambodiaAddress(
                address,
                props.annotation.gazetteerLanguage ?? "bilingual",
              ),
            });
          }}
          className={`${props.compact ? "h-8 w-32" : "mt-1 h-8 w-full"} rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-blue-500`}
        >
          <option value="province">Province</option>
          <option value="district">District</option>
          <option value="commune">Commune</option>
          <option value="village">Village</option>
        </select>
      </label>
    </div>
  );
}

function ShortcutsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Switch tools without leaving the document. Shortcuts pause while
            you type in a field.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOOL_SHORTCUT_ITEMS.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-700">
                {item.label}
              </span>
              <kbd className="flex size-7 items-center justify-center rounded-md border border-slate-300 bg-white font-mono text-xs font-bold text-slate-700 shadow-sm">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
            Navigation
          </p>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-800">Ctrl/Cmd + wheel</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Zoom around the mouse pointer
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Space + drag</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Temporarily pan the document
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                Delete / Backspace
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Remove the selected item
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Ctrl/Cmd + Z</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Undo the last editor change
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">
                Ctrl/Cmd + Shift + Z
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Redo the last editor change
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignatureDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (strokes: Point[][]) => void;
}) {
  const { open, onOpenChange, onUse } = props;
  const padRef = useRef<SVGSVGElement>(null);
  const activeStrokeRef = useRef<Point[] | null>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);

  function pointFromSignatureEvent(event: React.PointerEvent<SVGSVGElement>) {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function handleSignaturePointerDown(
    event: React.PointerEvent<SVGSVGElement>,
  ) {
    const stroke = [pointFromSignatureEvent(event)];
    activeStrokeRef.current = stroke;
    setStrokes((current) => [...current, stroke]);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSignaturePointerMove(
    event: React.PointerEvent<SVGSVGElement>,
  ) {
    if (!activeStrokeRef.current) return;
    const nextStroke = [
      ...activeStrokeRef.current,
      pointFromSignatureEvent(event),
    ];
    activeStrokeRef.current = nextStroke;
    setStrokes((current) => [...current.slice(0, -1), nextStroke]);
  }

  function handleSignaturePointerUp() {
    activeStrokeRef.current = null;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) activeStrokeRef.current = null;
    onOpenChange(nextOpen);
  }

  function useSignature() {
    if (!strokes.length) return;
    onUse(strokes);
    setStrokes([]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create your signature</DialogTitle>
          <DialogDescription>
            Draw with your mouse, trackpad, finger, or stylus. It stays in this
            browser and is only added to your PDF when you place it.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <svg
            ref={padRef}
            role="img"
            aria-label="Signature drawing pad"
            viewBox="0 0 1000 320"
            preserveAspectRatio="none"
            onPointerDown={handleSignaturePointerDown}
            onPointerMove={handleSignaturePointerMove}
            onPointerUp={handleSignaturePointerUp}
            onPointerCancel={handleSignaturePointerUp}
            className="h-48 w-full touch-none cursor-crosshair bg-[linear-gradient(to_bottom,transparent_78%,#cbd5e1_78%,#cbd5e1_79%,transparent_79%)]"
          >
            {strokes.map((stroke, index) => (
              <polyline
                key={index}
                points={stroke
                  .map((point) => `${point.x * 1000},${point.y * 320}`)
                  .join(" ")}
                fill="none"
                stroke="#111827"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={!strokes.length}
            onClick={() => setStrokes([])}
          >
            Clear
          </Button>
          <Button
            type="button"
            disabled={!strokes.length}
            onClick={useSignature}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Use signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PageThumbnail(props: {
  document: PdfDocument;
  entry: PageEntry;
  displayNumber: number;
  active: boolean;
  onClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDropPage: (draggedId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | undefined;

    async function renderPage() {
      const page = await props.document.getPage(props.entry.sourcePage);
      if (cancelled || !canvasRef.current) return;
      const viewport = page.getViewport({
        scale: 0.2,
        rotation: (page.rotate + props.entry.rotation) % 360,
      });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [props.document, props.entry.sourcePage, props.entry.rotation]);

  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-pdf-studio-page", props.entry.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData(
          "application/x-pdf-studio-page",
        );
        if (draggedId) props.onDropPage(draggedId);
      }}
      className={`group w-full rounded-xl border p-2 transition ${
        props.active
          ? "border-blue-500 bg-blue-50 shadow-sm"
          : "border-transparent hover:border-slate-200 hover:bg-white"
      }`}
    >
      <button
        type="button"
        onClick={props.onClick}
        aria-label={`Open page ${props.displayNumber}`}
        aria-current={props.active ? "page" : undefined}
        className="block w-full text-left"
      >
        <div className="mx-auto overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200">
          <canvas ref={canvasRef} className="h-auto w-full" />
        </div>
        <span className={`mt-2 block text-center text-xs font-medium ${props.active ? "text-blue-700" : "text-slate-500"}`}>
          Page {props.displayNumber}
        </span>
      </button>
      {props.active && (
        <div className="mt-2 grid grid-cols-5 gap-1 border-t border-blue-100 pt-2">
          {[
            ["Move up", props.onMoveUp, <ArrowUp key="up" />],
            ["Move down", props.onMoveDown, <ArrowDown key="down" />],
            ["Rotate", props.onRotate, <RotateCw key="rotate" />],
            ["Duplicate", props.onDuplicate, <Copy key="copy" />],
            ["Delete", props.onDelete, <Trash2 key="delete" />],
          ].map(([label, action, icon]) => (
            <button
              key={label as string}
              type="button"
              title={label as string}
              aria-label={`${label} page ${props.displayNumber}`}
              onClick={action as () => void}
              className="flex size-6 items-center justify-center rounded text-slate-500 hover:bg-white hover:text-blue-700 [&_svg]:size-3"
            >
              {icon as React.ReactNode}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PdfEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageTargetRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<Annotation | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const spacePressedRef = useRef(false);
  const touchPointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<PinchGesture | null>(null);
  const renderTaskRef = useRef<{
    promise: Promise<void>;
    cancel: () => void;
  } | null>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [fileBytes, setFileBytes] =
    useState<Uint8Array<ArrayBuffer> | null>(null);
  const [fileName, setFileName] = useState("");
  const [pageOrder, setPageOrder] = useState<PageEntry[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>("build");
  const [availableDraft, setAvailableDraft] = useState<EditorDraft | null>(null);
  const [draftStatus, setDraftStatus] = useState<"saving" | "saved">("saved");
  const [invalidFieldIds, setInvalidFieldIds] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<PdfViewport>({
    width: 612,
    height: 792,
  });
  const [basePageSize, setBasePageSize] = useState<PdfViewport>({
    width: 612,
    height: 792,
  });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pinchScale, setPinchScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelBindingFieldId, setLabelBindingFieldId] = useState<string | null>(null);
  const [pdfTextRuns, setPdfTextRuns] = useState<PdfTextRun[]>([]);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [recipientRoles, setRecipientRoles] = useState<RecipientRole[]>([
    { id: createAnnotationId(), name: "Recipient", color: RECIPIENT_COLORS[0] },
  ]);
  const [createdShareLinks, setCreatedShareLinks] = useState<
    Array<{ roleId: string; roleName: string; roleColor: string; url: string }>
  >([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [pendingReplacement, setPendingReplacement] = useState<File | null>(
    null,
  );
  const [pendingSignature, setPendingSignature] = useState<Point[][] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isConvertingHtml, setIsConvertingHtml] = useState(false);
  const [htmlProgress, setHtmlProgress] = useState(0);
  const [extractionOpen, setExtractionOpen] = useState(false);
  const [extractionResult, setExtractionResult] =
    useState<PdfExtractionResult | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState({
    current: 0,
    total: 0,
  });
  const [extractionError, setExtractionError] = useState("");
  const [error, setError] = useState("");

  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedId) ?? null;
  const pageAnnotations = annotations.filter(
    (annotation) => annotation.page === pageNumber,
  );
  const currentPageEntry = pageOrder[pageNumber - 1];

  const commit = useCallback((next: Annotation[]) => {
    setAnnotations((current) => {
      setUndoStack((history) => [
        ...history.slice(-39),
        cloneAnnotations(current),
      ]);
      setRedoStack([]);
      return next;
    });
  }, []);

  useEffect(() => {
    void loadKhmerBrowserFont().catch(() => {
        // The system font stack remains available if this optional load fails.
    });
    void readDraft().then(setAvailableDraft).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!document || !fileBytes || pageOrder.length === 0) return;
    const timer = window.setTimeout(() => {
      setDraftStatus("saving");
      const draft: EditorDraft = {
        version: 1,
        fileName,
        fileBytes: fileBytes.slice().buffer,
        annotations: cloneAnnotations(annotations),
        pageOrder: pageOrder.map((entry) => ({ ...entry })),
        savedAt: Date.now(),
      };
      void writeDraft(draft)
        .then(() => {
          setDraftStatus("saved");
          setAvailableDraft(draft);
        })
        .catch(() => setDraftStatus("saved"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [annotations, document, fileBytes, fileName, pageOrder]);

  function calculateFitZoom() {
    const viewport = viewportRef.current;
    if (!viewport || !basePageSize.width) return DEFAULT_ZOOM;
    const pageGap = window.matchMedia("(min-width: 640px)").matches ? 80 : 24;
    return clampZoom((viewport.clientWidth - pageGap) / basePageSize.width);
  }

  function fitToScreen() {
    setFitMode(true);
    setPinchScale(1);
    setZoom(calculateFitZoom());
    requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    });
  }

  function setManualZoom(nextZoom: number) {
    setFitMode(false);
    setZoom(clampZoom(nextZoom));
  }

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;

    async function renderPage() {
      if (!currentPageEntry) return;
      const page = await document!.getPage(currentPageEntry.sourcePage);
      if (cancelled || !canvasRef.current) return;
      const rotation = (page.rotate + currentPageEntry.rotation) % 360;
      const baseViewport = page.getViewport({
        scale: 1,
        rotation,
      });
      const viewport = page.getViewport({
        scale: zoom,
        rotation,
      });
      const textContent = await page.getTextContent();
      if (cancelled) return;
      setPdfTextRuns(createPdfTextRuns(textContent.items, viewport));
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      renderTaskRef.current?.cancel();
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setBasePageSize(baseViewport);
      setPageSize(viewport);
      renderTaskRef.current = page.render({
        canvas,
        canvasContext: context,
        viewport,
      });
      try {
        await renderTaskRef.current.promise;
      } catch (cause) {
        if (
          !cancelled &&
          cause instanceof Error &&
          cause.name !== "RenderingCancelledException"
        ) {
          setError("This page could not be rendered.");
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [currentPageEntry, document, zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!document || !viewport || !fitMode) return;

    function updateFit() {
      const pageGap = window.matchMedia("(min-width: 640px)").matches ? 80 : 24;
      setZoom(
        clampZoom((viewport!.clientWidth - pageGap) / basePageSize.width),
      );
    }

    updateFit();
    const observer = new ResizeObserver(updateFit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [document, pageNumber, basePageSize.width, fitMode]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!document || !viewport) return;

    function handleEditorWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;

      event.preventDefault();
      event.stopPropagation();

      const targetZoom = clampZoom(
        zoom * Math.exp(-event.deltaY * 0.001),
      );
      if (targetZoom === zoom) return;

      const viewportRect = viewport!.getBoundingClientRect();
      const offsetX = event.clientX - viewportRect.left;
      const offsetY = event.clientY - viewportRect.top;
      const contentX = viewport!.scrollLeft + offsetX;
      const contentY = viewport!.scrollTop + offsetY;
      const ratio = targetZoom / zoom;

      setFitMode(false);
      setZoom(targetZoom);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const currentViewport = viewportRef.current;
          if (!currentViewport) return;
          currentViewport.scrollLeft = contentX * ratio - offsetX;
          currentViewport.scrollTop = contentY * ratio - offsetY;
        });
      });
    }

    viewport.addEventListener("wheel", handleEditorWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      viewport.removeEventListener("wheel", handleEditorWheel, {
        capture: true,
      });
    };
  }, [document, zoom]);

  useEffect(() => {
    return () => {
      if (document && typeof document.destroy === "function") {
        void document.destroy();
      }
    };
  }, [document]);

  useEffect(() => {
    if (!document) return;

    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [document]);

  useEffect(() => {
    function releaseSpace() {
      spacePressedRef.current = false;
      setIsSpacePressed(false);
    }

    function handleShortcutKeyDown(event: KeyboardEvent) {
      if (
        !document ||
        signatureOpen ||
        shortcutsOpen ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (!spacePressedRef.current) {
          spacePressedRef.current = true;
          setIsSpacePressed(true);
        }
        return;
      }

      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedId
      ) {
        event.preventDefault();
        setAnnotations((current) => {
          setUndoStack((history) => [
            ...history.slice(-39),
            cloneAnnotations(current),
          ]);
          setRedoStack([]);
          return current.filter((annotation) => annotation.id !== selectedId);
        });
        setSelectedId(null);
        return;
      }

      const commandKey = event.ctrlKey || event.metaKey;
      const normalizedKey = event.key.toLowerCase();
      if (commandKey && !event.altKey && normalizedKey === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          const next = redoStack.at(-1);
          if (!next) return;
          setUndoStack((history) => [
            ...history,
            cloneAnnotations(annotations),
          ]);
          setAnnotations(cloneAnnotations(next));
          setRedoStack((history) => history.slice(0, -1));
        } else {
          const previous = undoStack.at(-1);
          if (!previous) return;
          setRedoStack((history) => [
            ...history,
            cloneAnnotations(annotations),
          ]);
          setAnnotations(cloneAnnotations(previous));
          setUndoStack((history) => history.slice(0, -1));
        }
        setSelectedId(null);
        return;
      }

      if (commandKey && !event.altKey && normalizedKey === "y") {
        event.preventDefault();
        const next = redoStack.at(-1);
        if (!next) return;
        setUndoStack((history) => [
          ...history,
          cloneAnnotations(annotations),
        ]);
        setAnnotations(cloneAnnotations(next));
        setRedoStack((history) => history.slice(0, -1));
        setSelectedId(null);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const nextTool = TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (!nextTool) return;
      if (editorMode === "fill" && nextTool !== "select" && nextTool !== "pan") {
        return;
      }

      event.preventDefault();
      setSelectedId(null);
      if (nextTool === "image") {
        chooseImage();
        return;
      }
      if (nextTool === "signature" && !pendingSignature) {
        setSignatureOpen(true);
        return;
      }
      setTool(nextTool);
    }

    function handleShortcutKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") releaseSpace();
    }

    window.addEventListener("keydown", handleShortcutKeyDown);
    window.addEventListener("keyup", handleShortcutKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", handleShortcutKeyDown);
      window.removeEventListener("keyup", handleShortcutKeyUp);
      window.removeEventListener("blur", releaseSpace);
      releaseSpace();
    };
  }, [
    annotations,
    document,
    editorMode,
    pendingSignature,
    redoStack,
    selectedId,
    shortcutsOpen,
    signatureOpen,
    undoStack,
  ]);

  async function loadEditorDocument(
    bytes: Uint8Array<ArrayBuffer>,
    nextFileName: string,
    restoredAnnotations: Annotation[] = [],
    restoredPageOrder?: PageEntry[],
  ) {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
    const nextDocument = (await pdfjs.getDocument({ data: bytes.slice() })
      .promise) as unknown as PdfDocument;
    if (document && typeof document.destroy === "function") {
      await document.destroy();
    }
    setDocument(nextDocument);
    setFileBytes(bytes);
    setFileName(nextFileName);
    setPageOrder(
      restoredPageOrder?.length
        ? restoredPageOrder.map((entry) => ({ ...entry }))
        : Array.from({ length: nextDocument.numPages }, (_, index) =>
            createPageEntry(index + 1),
          ),
    );
    setPageNumber(1);
    setZoom(DEFAULT_ZOOM);
    setFitMode(true);
    setPinchScale(1);
    touchPointersRef.current.clear();
    pinchRef.current = null;
    setAnnotations(cloneAnnotations(restoredAnnotations));
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
    setInvalidFieldIds([]);
    setTool("select");
    setEditorMode("build");
    setPendingSignature(null);
    setSignatureOpen(false);
    setExtractionResult(null);
    setExtractionError("");
    setExtractionProgress({ current: 0, total: 0 });
  }

  async function openFile(file: File) {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Choose a PDF file to continue.");
      return;
    }
    if (file.size > 35 * 1024 * 1024) {
      setError(
        "This file is larger than 35 MB. Choose a smaller PDF for this browser editor.",
      );
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const bytes = new Uint8Array(
        await file.arrayBuffer(),
      ) as Uint8Array<ArrayBuffer>;
      await loadEditorDocument(bytes, file.name);
      setAvailableDraft(null);
    } catch (cause) {
      console.error("Failed to open PDF", cause);
      setError(
        "We couldn’t open this PDF. It may be encrypted, damaged, or unsupported.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function restoreDraft() {
    if (!availableDraft) return;
    setIsLoading(true);
    setError("");
    try {
      const bytes = new Uint8Array(
        availableDraft.fileBytes.slice(0),
      ) as Uint8Array<ArrayBuffer>;
      await loadEditorDocument(
        bytes,
        availableDraft.fileName,
        availableDraft.annotations,
        availableDraft.pageOrder,
      );
    } catch {
      setError("This saved draft could not be restored.");
    } finally {
      setIsLoading(false);
    }
  }

  function remapAnnotationsForPageOrder(
    previous: PageEntry[],
    next: PageEntry[],
    current: Annotation[],
  ) {
    const nextIndex = new Map(next.map((entry, index) => [entry.id, index + 1]));
    return current.flatMap((annotation) => {
      const entry = previous[annotation.page - 1];
      const nextPage = entry ? nextIndex.get(entry.id) : undefined;
      return nextPage ? [{ ...annotation, page: nextPage }] : [];
    });
  }

  function moveCurrentPage(direction: -1 | 1) {
    const index = pageNumber - 1;
    const target = index + direction;
    if (target < 0 || target >= pageOrder.length) return;
    const next = [...pageOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setAnnotations((current) =>
      remapAnnotationsForPageOrder(pageOrder, next, current),
    );
    setPageOrder(next);
    setPageNumber(target + 1);
    setSelectedId(null);
  }

  function reorderPage(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const fromIndex = pageOrder.findIndex((entry) => entry.id === draggedId);
    const targetIndex = pageOrder.findIndex((entry) => entry.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const next = [...pageOrder];
    const [dragged] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, dragged);
    setAnnotations((current) =>
      remapAnnotationsForPageOrder(pageOrder, next, current),
    );
    setPageOrder(next);
    setPageNumber(targetIndex + 1);
    setSelectedId(null);
  }

  function rotateCurrentPage() {
    setPageOrder((current) =>
      current.map((entry, index) =>
        index === pageNumber - 1
          ? { ...entry, rotation: ((entry.rotation + 90) % 360) as PageEntry["rotation"] }
          : entry,
      ),
    );
  }

  function duplicateCurrentPage() {
    const index = pageNumber - 1;
    const original = pageOrder[index];
    if (!original) return;
    const duplicate: PageEntry = { ...original, id: createAnnotationId() };
    const next = [...pageOrder.slice(0, index + 1), duplicate, ...pageOrder.slice(index + 1)];
    const remapped = remapAnnotationsForPageOrder(pageOrder, next, annotations);
    const copies = annotations
      .filter((annotation) => annotation.page === pageNumber)
      .map((annotation) => ({
        ...cloneAnnotations([annotation])[0],
        id: createAnnotationId(),
        page: index + 2,
      }));
    setAnnotations([...remapped, ...copies]);
    setPageOrder(next);
    setPageNumber(index + 2);
    setSelectedId(null);
  }

  function deleteCurrentPage() {
    if (pageOrder.length <= 1) return;
    const next = pageOrder.filter((_, index) => index !== pageNumber - 1);
    setAnnotations((current) =>
      remapAnnotationsForPageOrder(pageOrder, next, current),
    );
    setPageOrder(next);
    setPageNumber(Math.min(pageNumber, next.length));
    setSelectedId(null);
  }

  function requestOpenFile(file: File) {
    if (document) {
      setPendingReplacement(file);
      return;
    }
    void openFile(file);
  }

  async function prepareImage(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw new Error('Choose a PNG, JPEG, or WebP image.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Choose an image smaller than 10 MB.');
    }

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await window.createImageBitmap(file);
      const maximumDimension = 1800;
      const scale = Math.min(
        1,
        maximumDimension / Math.max(bitmap.width, bitmap.height),
      );
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return {
        imageData: canvas.toDataURL('image/png'),
        imageName: file.name,
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
      };
    } finally {
      bitmap?.close();
    }
  }

  async function addImage(file: File, targetId?: string | null) {
    if (!document) return;
    setIsAddingImage(true);
    setError("");
    try {
      const prepared = await prepareImage(file);

      if (targetId) {
        const target = annotations.find((item) => item.id === targetId);
        if (!target || target.type !== 'image-placeholder') return;
        commit(
          annotations.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  imageData: prepared.imageData,
                  imageName: prepared.imageName,
                }
              : item,
          ),
        );
        setSelectedId(targetId);
        setTool('select');
        return;
      }

      let width = 0.42;
      let height =
        width *
        (prepared.pixelHeight / prepared.pixelWidth) *
        (basePageSize.width / basePageSize.height);
      if (height > 0.45) {
        const ratio = 0.45 / height;
        width *= ratio;
        height = 0.45;
      }

      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: "image",
        x: (1 - width) / 2,
        y: (1 - height) / 2,
        width,
        height,
        color: "#111827",
        imageData: prepared.imageData,
        imageName: prepared.imageName,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
    } catch (cause) {
      console.error("Failed to add image", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "This image could not be added. Try another PNG or JPEG file.",
      );
    } finally {
      setIsAddingImage(false);
    }
  }

  function chooseImage(targetId?: string) {
    imageTargetRef.current = targetId ?? null;
    imageInputRef.current?.click();
  }

  function pointFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function handleTouchPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (touchPointersRef.current.size !== 2) return;

    const viewport = viewportRef.current;
    if (!viewport) return;
    const [first, second] = Array.from(touchPointersRef.current.values());
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    const viewportRect = viewport.getBoundingClientRect();
    const centerOffsetX = centerX - viewportRect.left;
    const centerOffsetY = centerY - viewportRect.top;

    const interaction = interactionRef.current;
    if (interaction && interaction.mode !== "pan") {
      setAnnotations(cloneAnnotations(interaction.before));
    }
    interactionRef.current = null;
    const drawing = drawingRef.current;
    if (drawing) {
      setAnnotations((current) =>
        current.filter((annotation) => annotation.id !== drawing.id),
      );
      drawingRef.current = null;
    }

    pinchRef.current = {
      startDistance: Math.max(1, pointDistance(first, second)),
      startZoom: zoom,
      targetZoom: zoom,
      contentX: viewport.scrollLeft + centerOffsetX,
      contentY: viewport.scrollTop + centerOffsetY,
      centerOffsetX,
      centerOffsetY,
    };
    surfaceRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTouchPointerMove(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (
      event.pointerType !== "touch" ||
      !touchPointersRef.current.has(event.pointerId)
    ) {
      return;
    }
    touchPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = pinchRef.current;
    if (!pinch || touchPointersRef.current.size < 2) return;

    const [first, second] = Array.from(touchPointersRef.current.values());
    const distance = pointDistance(first, second);
    const nextZoom = clampZoom(
      pinch.startZoom * (distance / pinch.startDistance),
    );
    pinch.targetZoom = nextZoom;
    setPinchScale(nextZoom / pinch.startZoom);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTouchPointerEnd(
    event: React.PointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.delete(event.pointerId);
    const pinch = pinchRef.current;
    if (!pinch || touchPointersRef.current.size >= 2) return;

    pinchRef.current = null;
    setPinchScale(1);
    setFitMode(false);
    setZoom(pinch.targetZoom);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const ratio = pinch.targetZoom / pinch.startZoom;
        viewport.scrollLeft =
          pinch.contentX * ratio - pinch.centerOffsetX;
        viewport.scrollTop =
          pinch.contentY * ratio - pinch.centerOffsetY;
      });
    });
    event.preventDefault();
    event.stopPropagation();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!document) return;

    if (
      tool === "pan" ||
      spacePressedRef.current ||
      (event.pointerType === "touch" &&
        tool === "select" &&
        event.target === surfaceRef.current)
    ) {
      const viewport = viewportRef.current;
      if (!viewport) return;
      interactionRef.current = {
        mode: "pan",
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      surfaceRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (tool === "select") {
      if (event.target === surfaceRef.current) setSelectedId(null);
      return;
    }
    if (editorMode === "fill") return;
    const point = pointFromEvent(event);
    surfaceRef.current?.setPointerCapture(event.pointerId);

    if (tool === "text" || tool === "date" || tool === "initials") {
      const isDate = tool === "date";
      const isInitials = tool === "initials";
      const annotationWidth = isDate
        ? Math.min(0.38, 180 / basePageSize.width)
        : isInitials
          ? 0.12
          : 0.28;
      const annotationHeight = isDate
        ? Math.min(0.075, 36 / basePageSize.height)
        : 0.05;
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: tool,
        x: Math.min(1 - annotationWidth, point.x),
        y: Math.min(1 - annotationHeight, point.y),
        width: annotationWidth,
        height: annotationHeight,
        color,
        text: isDate
          ? currentDateValue()
          : isInitials
            ? "AB"
            : "Type your text",
        fontSize: isInitials ? 18 : isDate ? 14 : 16,
        fieldName: isDate ? "Date" : isInitials ? "Initials" : undefined,
        required: false,
        tabIndex: annotations.length + 1,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "input") {
      const fieldWidth = Math.min(0.42, 200 / basePageSize.width);
      const fieldHeight = Math.min(0.08, 32 / basePageSize.height);
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: "input",
        x: Math.min(1 - fieldWidth, point.x),
        y: Math.min(1 - fieldHeight, point.y),
        width: fieldWidth,
        height: fieldHeight,
        color,
        borderColor: "#64748b",
        text: "",
        fontSize: 14,
        fieldName: "Text field",
        placeholder: "Enter value",
        required: false,
        validation: "none",
        tabIndex: annotations.length + 1,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "checkbox" || tool === "radio") {
      const fieldSize = 22;
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: tool,
        x: point.x,
        y: point.y,
        width: fieldSize / basePageSize.width,
        height: fieldSize / basePageSize.height,
        color,
        checked: true,
        fieldName: tool === "radio" ? "Radio" : "Checkbox",
        required: false,
        tabIndex: annotations.length + 1,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "checkbox-group" || tool === "radio-group") {
      const groupWidth = Math.min(0.48, 250 / basePageSize.width);
      const groupHeight = Math.min(0.25, 138 / basePageSize.height);
      const isRadioGroup = tool === "radio-group";
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: tool,
        x: Math.min(1 - groupWidth, point.x),
        y: Math.min(1 - groupHeight, point.y),
        width: groupWidth,
        height: groupHeight,
        color,
        label: isRadioGroup ? "Choose one" : "Select all that apply",
        options: ["Option 1", "Option 2", "Option 3"].map(
          (label, index) => ({
            id: createAnnotationId(),
            label,
            checked: isRadioGroup && index === 0,
          }),
        ),
        fieldName: isRadioGroup ? "Radio group" : "Checkbox group",
        required: false,
        tabIndex: annotations.length + 1,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "dropdown") {
      const fieldWidth = Math.min(0.42, 210 / basePageSize.width);
      const fieldHeight = Math.min(0.08, 34 / basePageSize.height);
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: "dropdown",
        x: Math.min(1 - fieldWidth, point.x),
        y: Math.min(1 - fieldHeight, point.y),
        width: fieldWidth,
        height: fieldHeight,
        color,
        borderColor: "#64748b",
        label: "Select an option",
        options: ["Option 1", "Option 2", "Option 3"].map((label) => ({
          id: createAnnotationId(),
          label,
          checked: false,
        })),
        fontSize: 14,
        fieldName: "Dropdown",
        required: false,
        tabIndex: annotations.length + 1,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "cambodia-address") {
      const fieldWidth = Math.min(0.62, 340 / basePageSize.width);
      const fieldHeight = Math.min(0.22, 140 / basePageSize.height);
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: "cambodia-address",
        x: Math.min(1 - fieldWidth, point.x),
        y: Math.min(1 - fieldHeight, point.y),
        width: fieldWidth,
        height: fieldHeight,
        color,
        borderColor: "#64748b",
        label: "Cambodia address",
        address: parseCambodiaAddress(null),
        gazetteerLanguage: "bilingual",
        gazetteerLevel: "village",
        fontSize: 11,
        fieldName: "Cambodia address",
        required: false,
        tabIndex: annotations.length + 1,
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "image-placeholder") {
      const placeholderWidth = Math.min(0.44, 240 / basePageSize.width);
      const placeholderHeight = Math.min(0.24, 130 / basePageSize.height);
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: "image-placeholder",
        x: Math.min(1 - placeholderWidth, point.x),
        y: Math.min(1 - placeholderHeight, point.y),
        width: placeholderWidth,
        height: placeholderHeight,
        color: "#475569",
        label: "Upload image",
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "signature" && pendingSignature) {
      const annotation: Annotation = {
        id: createAnnotationId(),
        page: pageNumber,
        type: "signature",
        x: point.x,
        y: point.y,
        width: 0.3,
        height: 0.1,
        color: "#111827",
        strokes: pendingSignature.map((stroke) =>
          stroke.map((signaturePoint) => ({ ...signaturePoint })),
        ),
      };
      commit([...annotations, annotation]);
      setSelectedId(annotation.id);
      setPendingSignature(null);
      setTool("select");
      return;
    }
    if (tool === "signature") return;

    const annotation: Annotation = {
      id: createAnnotationId(),
      page: pageNumber,
      type: tool === "pen" ? "drawing" : tool,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      color,
      strokeWidth: tool === "pen" ? 2.5 : 2,
      points: [point],
    };
    drawingRef.current = annotation;
    setAnnotations([...annotations, annotation]);
    setSelectedId(annotation.id);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const interaction = interactionRef.current;
    if (interaction?.mode === "pan") {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft =
        interaction.scrollLeft - (event.clientX - interaction.clientX);
      viewport.scrollTop =
        interaction.scrollTop - (event.clientY - interaction.clientY);
      return;
    }

    if (interaction) {
      const point = pointFromEvent(event);
      const deltaX = point.x - interaction.start.x;
      const deltaY = point.y - interaction.start.y;
      let next = interaction.origin;

      if (interaction.mode === "move") {
        if (next.type === "drawing") {
          next = {
            ...next,
            points: next.points?.map((item) => ({
              x: Math.min(1, Math.max(0, item.x + deltaX)),
              y: Math.min(1, Math.max(0, item.y + deltaY)),
            })),
          };
        } else {
          next = {
            ...next,
            x: Math.min(1 - next.width, Math.max(0, next.x + deltaX)),
            y: Math.min(1 - next.height, Math.max(0, next.y + deltaY)),
          };
        }
      } else {
        if (isSquareField(next.type)) {
          const horizontalDelta = deltaX * basePageSize.width;
          const verticalDelta = deltaY * basePageSize.height;
          const dominantDelta =
            Math.abs(horizontalDelta) >= Math.abs(verticalDelta)
              ? horizontalDelta
              : verticalDelta;
          const originalSize = Math.max(
            next.width * basePageSize.width,
            next.height * basePageSize.height,
          );
          const maximumSize = Math.min(
            (1 - next.x) * basePageSize.width,
            (1 - next.y) * basePageSize.height,
          );
          const size = Math.min(
            maximumSize,
            Math.max(14, originalSize + dominantDelta),
          );
          next = {
            ...next,
            width: size / basePageSize.width,
            height: size / basePageSize.height,
          };
        } else {
          const minimumWidth = isInteractivePdfField(next.type)
            ? 40 / basePageSize.width
            : 24 / basePageSize.width;
          const minimumHeight = isInteractivePdfField(next.type)
            ? 18 / basePageSize.height
            : 14 / basePageSize.height;
          next = {
            ...next,
            width: Math.min(
              1 - next.x,
              Math.max(minimumWidth, next.width + deltaX),
            ),
            height: Math.min(
              1 - next.y,
              Math.max(minimumHeight, next.height + deltaY),
            ),
          };
        }
      }

      setAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === interaction.id ? next : annotation,
        ),
      );
      return;
    }

    const active = drawingRef.current;
    if (!active) return;
    const point = pointFromEvent(event);
    let next: Annotation;

    if (active.type === "drawing") {
      next = { ...active, points: [...(active.points ?? []), point] };
    } else {
      const start = active.points?.[0] ?? { x: active.x, y: active.y };
      next = {
        ...active,
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
        lineDirection:
          active.type === "line"
            ? point.y >= start.y
              ? "down"
              : "up"
            : active.lineDirection,
      };
    }
    drawingRef.current = next;
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === next.id ? next : annotation,
      ),
    );
  }

  function handlePointerUp() {
    const interaction = interactionRef.current;
    if (interaction) {
      interactionRef.current = null;
      if (interaction.mode !== "pan") {
        setUndoStack((history) => [
          ...history.slice(-39),
          cloneAnnotations(interaction.before),
        ]);
        setRedoStack([]);
      }
      return;
    }

    const active = drawingRef.current;
    if (!active) return;
    drawingRef.current = null;
    setUndoStack((history) => [
      ...history.slice(-39),
      annotations.filter((annotation) => annotation.id !== active.id),
    ]);
    setRedoStack([]);
    setTool("select");
  }

  function startAnnotationInteraction(
    event: React.PointerEvent<HTMLElement | SVGPolylineElement>,
    annotation: Annotation,
    mode: "move" | "resize",
  ) {
    if (spacePressedRef.current || editorMode === "fill") return;
    if (tool !== "select") return;
    event.stopPropagation();
    setSelectedId(annotation.id);
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    interactionRef.current = {
      mode,
      id: annotation.id,
      start: {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      },
      origin: cloneAnnotations([annotation])[0],
      before: cloneAnnotations(annotations),
    };
    surfaceRef.current?.setPointerCapture(event.pointerId);
  }

  function activateAnnotation(annotation: Annotation) {
    if (
      annotation.type === "text" ||
      annotation.type === "input" ||
      annotation.type === "initials"
    ) {
      const nextText = window.prompt(
        annotation.type === "input"
          ? "Input value"
          : annotation.type === "initials"
              ? "Edit initials"
              : "Edit text",
        annotation.text ?? "",
      );
      if (nextText === null) return;
      setSelectedId(annotation.id);
      commit(
        annotations.map((item) =>
          item.id === annotation.id ? { ...item, text: nextText } : item,
        ),
      );
      return;
    }
    if (annotation.type === "checkbox" || annotation.type === "radio") {
      setSelectedId(annotation.id);
      commit(
        annotations.map((item) =>
          item.id === annotation.id
            ? { ...item, checked: !item.checked }
            : item,
        ),
      );
    }
  }

  function updateSelected(changes: Partial<Annotation>) {
    if (!selectedId) return;
    commit(
      annotations.map((annotation) =>
        annotation.id === selectedId
          ? { ...annotation, ...changes }
          : annotation,
      ),
    );
  }

  function startLabelBinding() {
    if (!selectedAnnotation) return;
    setLabelBindingFieldId(selectedAnnotation.id);
    setError("Click the existing PDF text that labels this field.");
  }

  function bindPdfLabel(run: PdfTextRun) {
    if (!labelBindingFieldId) return;
    const fieldKey = createFieldKey(run.text, `field_${labelBindingFieldId.slice(-8)}`);
    commit(
      annotations.map((annotation) =>
        annotation.id === labelBindingFieldId
          ? {
              ...annotation,
              fieldName: run.text,
              fieldKey,
              labelBinding: {
                text: run.text,
                sourceText: run.text,
                page: pageNumber,
                rect: run.rect,
                source: "pdf-text" as const,
              },
            }
          : annotation,
      ),
    );
    setSelectedId(labelBindingFieldId);
    setLabelBindingFieldId(null);
    setError("");
  }

  function updateAnnotationValue(id: string, changes: Partial<Annotation>) {
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === id ? { ...annotation, ...changes } : annotation,
      ),
    );
    setInvalidFieldIds((current) => current.filter((fieldId) => fieldId !== id));
  }

  function duplicateSelectedAcrossPages() {
    if (!selectedAnnotation || pageOrder.length < 2) return;
    const copies = pageOrder
      .map((_, index) => index + 1)
      .filter((page) => page !== selectedAnnotation.page)
      .map((page) => ({
        ...cloneAnnotations([selectedAnnotation])[0],
        id: createAnnotationId(),
        page,
        fieldName: selectedAnnotation.fieldName
          ? `${selectedAnnotation.fieldName} ${page}`
          : undefined,
      }));
    commit([...annotations, ...copies]);
  }

  function addRecipientRole() {
    if (recipientRoles.length >= 10) return;
    setRecipientRoles((current) => [
      ...current,
      {
        id: createAnnotationId(),
        name: `Recipient ${current.length + 1}`,
        color: RECIPIENT_COLORS[current.length % RECIPIENT_COLORS.length],
      },
    ]);
  }

  function updateRecipientRole(id: string, changes: Partial<RecipientRole>) {
    setRecipientRoles((current) =>
      current.map((role) => (role.id === id ? { ...role, ...changes } : role)),
    );
  }

  function removeRecipientRole(id: string) {
    if (recipientRoles.length <= 1) return;
    const fallbackId = recipientRoles.find((role) => role.id !== id)?.id;
    setRecipientRoles((current) => current.filter((role) => role.id !== id));
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.recipientRoleId === id
          ? { ...annotation, recipientRoleId: fallbackId }
          : annotation,
      ),
    );
  }

  async function saveTemplate() {
    if (!fileBytes || !templateName.trim() || recipientRoles.length === 0) return;
    setIsSavingTemplate(true);
    setError("");
    try {
      const defaultRoleId = recipientRoles[0].id;
      const templateAnnotations = annotations.map((annotation) =>
        isAssignableTemplateField(annotation.type) && !annotation.recipientRoleId
          ? { ...annotation, recipientRoleId: defaultRoleId }
          : annotation,
      );
      const duplicateKeys = duplicateFieldKeys(
        templateAnnotations.filter((annotation) => isAssignableTemplateField(annotation.type)),
      );
      if (duplicateKeys.size > 0) {
        setInvalidFieldIds(
          templateAnnotations
            .filter((annotation) => duplicateKeys.has(createFieldKey(annotation.fieldKey || annotation.fieldName || annotation.label || annotation.type)))
            .map((annotation) => annotation.id),
        );
        throw new Error(`Field keys must be unique: ${[...duplicateKeys].join(", ")}`);
      }
      const formData = new FormData();
      formData.set(
        "pdf",
        new File([fileBytes.slice()], fileName || "template.pdf", {
          type: "application/pdf",
        }),
      );
      formData.set("name", templateName.trim());
      formData.set("description", templateDescription.trim());
      formData.set("annotations", JSON.stringify(templateAnnotations));
      formData.set("pageOrder", JSON.stringify(pageOrder));
      formData.set("roles", JSON.stringify(recipientRoles));

      const response = await fetch("/api/templates", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        template?: {
          shareLinks?: Array<{
            roleId: string;
            roleName: string;
            roleColor: string;
            url: string;
          }>;
        };
      };
      if (!response.ok) throw new Error(payload.error || "Template could not be saved.");
      setAnnotations(templateAnnotations);
      setCreatedShareLinks(payload.template?.shareLinks ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Template could not be saved.");
    } finally {
      setIsSavingTemplate(false);
    }
  }

  function deleteSelected() {
    if (!selectedId) return;
    commit(
      annotations.filter((annotation) => annotation.id !== selectedId),
    );
    setSelectedId(null);
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((history) => [...history, cloneAnnotations(annotations)]);
    setAnnotations(cloneAnnotations(previous));
    setUndoStack((history) => history.slice(0, -1));
    setSelectedId(null);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((history) => [...history, cloneAnnotations(annotations)]);
    setAnnotations(cloneAnnotations(next));
    setRedoStack((history) => history.slice(0, -1));
    setSelectedId(null);
  }

  async function exportPdf() {
    if (!fileBytes) return;
    const invalidFields = annotations.filter(
      (annotation) =>
        (isInteractivePdfField(annotation.type) ||
          annotation.type === "checkbox-group" ||
          annotation.type === "radio-group") &&
        !fieldValueIsValid(annotation),
    );
    if (invalidFields.length > 0) {
      setInvalidFieldIds(invalidFields.map((annotation) => annotation.id));
      setPageNumber(invalidFields[0].page);
      setEditorMode("fill");
      setError(`Complete ${invalidFields.length} required or invalid field${invalidFields.length === 1 ? "" : "s"} before saving.`);
      return;
    }
    setIsExporting(true);
    setError("");
    try {
      const {
        PDFDocument,
        PDFHexString,
        PDFName,
        degrees,
        rgb,
      } = await import("pdf-lib");
      await import("regenerator-runtime/runtime");
      const fontkitModule = await import("@pdf-lib/fontkit");
      const sourcePdf = await PDFDocument.load(fileBytes.slice());
      const pdf = await PDFDocument.create();
      const copiedPages = await pdf.copyPages(
        sourcePdf,
        pageOrder.map((entry) => entry.sourcePage - 1),
      );
      copiedPages.forEach((page, index) => {
        const baseRotation = page.getRotation().angle;
        page.setRotation(
          degrees((baseRotation + (pageOrder[index]?.rotation ?? 0)) % 360),
        );
        pdf.addPage(page);
      });
      pdf.registerFontkit(fontkitModule.default);
      const font = await pdf.embedFont(await loadKhmerFontBytes(), {
        subset: false,
        customName: "NotoSansKhmer",
      });
      const form = pdf.getForm();
      const pages = pdf.getPages();

      function configureField<T extends {
        enableRequired: () => void;
        acroField: {
          dict: {
            set: (
              key: ReturnType<typeof PDFName.of>,
              value: ReturnType<typeof PDFHexString.fromText>,
            ) => void;
          };
        };
      }>(
        field: T,
        annotation: Annotation,
      ) {
        if (annotation.required) field.enableRequired();
        const description = annotation.placeholder || annotation.fieldName;
        if (description) {
          field.acroField.dict.set(
            PDFName.of("TU"),
            PDFHexString.fromText(description),
          );
        }
      }

      async function drawTextWithKhmerSupport(options: {
        page: (typeof pages)[number];
        text: string;
        x: number;
        topY: number;
        size: number;
        maxWidth: number;
        color: string;
      }) {
        const { page, text, x, topY, size, maxWidth, color } = options;
        if (!containsKhmer(text)) {
          const parsedColor = hexToRgb(color);
          page.drawText(text, {
            x,
            y: topY - size,
            size,
            font,
            color: rgb(parsedColor.r, parsedColor.g, parsedColor.b),
            maxWidth,
          });
          return;
        }
        const rendered = await renderKhmerTextImage({
          text,
          fontSize: size,
          color,
          maxWidth,
        });
        const image = await pdf.embedPng(dataUrlToBytes(rendered.dataUrl));
        page.drawImage(image, {
          x,
          y: topY - rendered.height,
          width: rendered.width,
          height: rendered.height,
        });
      }

      function enableImageImport(button: ReturnType<typeof form.createButton>) {
        const script = [
          "try {",
          "  var imported = event.target.buttonImportIcon();",
          "  if (imported === 0) {",
          "    event.target.buttonPosition = position.iconOnly;",
          "    event.target.buttonScaleHow = scaleHow.proportional;",
          "    event.target.buttonScaleWhen = scaleWhen.always;",
          "    event.target.buttonFitBounds = true;",
          "  }",
          "} catch (error) {",
          '  app.alert("Open this PDF in Adobe Acrobat to upload an image. Browser PDF viewers and Acrobat Reader do not support this field action.");',
          "}",
        ].join("\n");
        const action = pdf.context.obj({
          S: "JavaScript",
          JS: PDFHexString.fromText(script),
        });
        const actionRef = pdf.context.register(action);
        button.acroField.dict.set(
          PDFName.of("TU"),
          PDFHexString.fromText(
            "Click to upload or replace this image in Adobe Acrobat",
          ),
        );
        for (const widget of button.acroField.getWidgets()) {
          widget.dict.set(PDFName.of("A"), actionRef);
        }
      }

      for (const annotation of [...annotations].sort(
        (left, right) =>
          left.page - right.page ||
          (left.tabIndex ?? Number.MAX_SAFE_INTEGER) -
            (right.tabIndex ?? Number.MAX_SAFE_INTEGER),
      )) {
        const page = pages[annotation.page - 1];
        if (!page) continue;
        const cropBox = page.getCropBox();
        const rotation = page.getRotation().angle;
        const annotationBox = normalizedRectToPdfBox(
          annotation,
          cropBox,
          rotation,
        );
        const parsed = hexToRgb(annotation.color);
        const ink = rgb(parsed.r, parsed.g, parsed.b);

        if (
          annotation.type === "checkbox-group" ||
          annotation.type === "radio-group"
        ) {
          const options = annotation.options ?? [];
          const left = annotationBox.x;
          const top = annotationBox.y + annotationBox.height;
          const groupHeight = annotationBox.height;
          const labelSize = 12;
          const rowHeight = Math.max(
            18,
            (groupHeight - labelSize - 8) / Math.max(1, options.length),
          );
          const controlSize = Math.min(14, rowHeight * 0.65);
          await drawTextWithKhmerSupport({
            page,
            text: annotation.label ?? "Options",
            x: left + 4,
            topY: top,
            size: labelSize,
            color: "#0f172a",
            maxWidth: Math.max(20, annotationBox.width - 8),
          });

          const radioField =
            annotation.type === "radio-group"
              ? form.createRadioGroup(createPdfFieldName(annotation))
              : null;
          if (radioField) configureField(radioField, annotation);
          let selectedOption: string | null = null;
          for (let index = 0; index < options.length; index += 1) {
            const option = options[index];
            const controlX = left + 5;
            const controlY =
              top - labelSize - 8 - rowHeight * (index + 1) +
              (rowHeight - controlSize) / 2;
            const optionValue = `option_${index + 1}_${option.id.replaceAll(/[^a-zA-Z0-9]/g, "")}`;
            const appearance = {
              x: controlX,
              y: controlY,
              width: controlSize,
              height: controlSize,
              backgroundColor: rgb(1, 1, 1),
              borderColor: ink,
              borderWidth: 1,
            };
            if (radioField) {
              radioField.addOptionToPage(optionValue, page, appearance);
              if (option.checked) selectedOption = optionValue;
            } else {
              const checkBox = form.createCheckBox(
                `${createPdfFieldName(annotation)}_${index + 1}`,
              );
              configureField(checkBox, annotation);
              checkBox.addToPage(page, appearance);
              if (option.checked) checkBox.check();
              checkBox.defaultUpdateAppearances();
            }
            await drawTextWithKhmerSupport({
              page,
              text: option.label || `Option ${index + 1}`,
              x: controlX + controlSize + 7,
              topY: controlY + controlSize,
              size: 10,
              color: "#1e293b",
              maxWidth: Math.max(20, annotationBox.width - controlSize - 16),
            });
          }
          if (radioField && selectedOption) radioField.select(selectedOption);
          radioField?.defaultUpdateAppearances();
          continue;
        }

        if (isInteractivePdfField(annotation.type)) {
          const fieldName = createPdfFieldName(annotation);
          const fieldX = annotationBox.x;
          const fieldY = annotationBox.y;
          let fieldWidth = annotationBox.width;
          let fieldHeight = annotationBox.height;
          if (isSquareField(annotation.type)) {
            const size = Math.min(fieldWidth, fieldHeight);
            fieldWidth = size;
            fieldHeight = size;
          }
          const fieldBorder =
            annotation.type === "input" ||
            annotation.type === "cambodia-address"
              ? hexToRgb(annotation.borderColor ?? "#64748b")
              : parsed;
          const appearance = {
            x: fieldX,
            y: fieldY,
            width: fieldWidth,
            height: fieldHeight,
            textColor: ink,
            backgroundColor: rgb(1, 1, 1),
            borderColor: rgb(
              fieldBorder.r,
              fieldBorder.g,
              fieldBorder.b,
            ),
            borderWidth: 1,
            font,
          };

          if (
            annotation.type === "input" ||
            annotation.type === "date" ||
            annotation.type === "initials" ||
            annotation.type === "cambodia-address"
          ) {
            const field = form.createTextField(fieldName);
            configureField(field, annotation);
            if (annotation.multiline || annotation.type === "cambodia-address") {
              field.enableMultiline();
            }
            const value =
              annotation.type === "cambodia-address"
                ? formatCambodiaAddress(
                    annotation.address,
                    annotation.gazetteerLanguage ?? "bilingual",
                  )
                : annotation.type === "input" &&
                    annotation.text === "Text input"
                  ? ""
                  : annotation.text ?? "";
            const fieldFontSize = annotation.fontSize ?? 14;
            if (containsKhmer(value)) {
              field.addToPage(page, {
                ...appearance,
                backgroundColor: undefined,
              });
              field.setFontSize(fieldFontSize);
              field.setText(value);
              const rendered = await renderKhmerTextImage({
                text: value,
                fontSize: fieldFontSize,
                color: annotation.color,
                maxWidth: Math.max(1, fieldWidth - 10),
              });
              const image = await pdf.embedPng(
                dataUrlToBytes(rendered.dataUrl),
              );
              page.drawImage(image, {
                x: fieldX + 5,
                y: fieldY + Math.max(0, (fieldHeight - rendered.height) / 2),
                width: rendered.width,
                height: rendered.height,
              });
            } else {
              field.setText(value);
              field.addToPage(page, appearance);
              field.setFontSize(fieldFontSize);
              field.updateAppearances(font);
            }
          }

          if (annotation.type === "checkbox") {
            const field = form.createCheckBox(fieldName);
            configureField(field, annotation);
            field.addToPage(page, appearance);
            if (annotation.checked) field.check();
            field.defaultUpdateAppearances();
          }

          if (annotation.type === "radio") {
            const field = form.createRadioGroup(fieldName);
            configureField(field, annotation);
            const option = "selected";
            field.addOptionToPage(option, page, appearance);
            if (annotation.checked) field.select(option);
            field.defaultUpdateAppearances();
          }
          if (annotation.type === "dropdown") {
            const field = form.createDropdown(fieldName);
            configureField(field, annotation);
            const options = (annotation.options ?? [])
              .map((option) => option.label.trim())
              .filter(Boolean);
            if (options.length > 0) field.addOptions(options);
            field.addToPage(page, appearance);
            const selectedOption = annotation.options?.find(
              (option) => option.checked,
            )?.label;
            if (selectedOption) field.select(selectedOption);
            field.setFontSize(annotation.fontSize ?? 14);
            field.updateAppearances(font);
          }
          continue;
        }

        if (annotation.type === "image-placeholder") {
          const button = form.createButton(createPdfFieldName(annotation));
          const fieldX = annotationBox.x;
          const fieldY = annotationBox.y;
          const fieldWidth = annotationBox.width;
          const fieldHeight = annotationBox.height;
          button.addToPage(
            annotation.imageData
              ? ""
              : annotation.label && annotation.label !== "Upload image"
                ? annotation.label
                : "Upload image in Adobe Acrobat",
            page,
            {
              x: fieldX,
              y: fieldY,
              width: fieldWidth,
              height: fieldHeight,
              textColor: rgb(0.28, 0.35, 0.44),
              backgroundColor: rgb(0.97, 0.98, 0.99),
              borderColor: rgb(0.58, 0.64, 0.72),
              borderWidth: 1.5,
              font,
            },
          );
          button.setFontSize(12);
          if (annotation.imageData) {
            const embeddedImage = await pdf.embedPng(
              dataUrlToBytes(annotation.imageData),
            );
            button.setImage(embeddedImage);
          } else {
            button.defaultUpdateAppearances(font);
          }
          enableImageImport(button);
          continue;
        }

        if (annotation.type === "image" && annotation.imageData) {
          const embeddedImage = await pdf.embedPng(
            dataUrlToBytes(annotation.imageData),
          );
          page.drawImage(embeddedImage, {
            x: annotationBox.x,
            y: annotationBox.y,
            width: annotationBox.width,
            height: annotationBox.height,
          });
          continue;
        }

        if (annotation.type === "text") {
          const size = annotation.fontSize ?? 16;
          await drawTextWithKhmerSupport({
            page,
            text: annotation.text || "",
            x: annotationBox.x,
            topY: annotationBox.y + annotationBox.height,
            size,
            color: annotation.color,
            maxWidth: Math.max(10, annotationBox.width),
          });
        }
        if (annotation.type === "highlight") {
          page.drawRectangle({
            x: annotationBox.x,
            y: annotationBox.y,
            width: annotationBox.width,
            height: annotationBox.height,
            color: ink,
            opacity: 0.35,
          });
        }
        if (annotation.type === "rectangle") {
          page.drawRectangle({
            x: annotationBox.x,
            y: annotationBox.y,
            width: annotationBox.width,
            height: annotationBox.height,
            borderColor: ink,
            borderWidth: annotation.strokeWidth ?? 2,
            opacity: 0,
          });
        }
        if (annotation.type === "ellipse") {
          const ellipseWidth = annotationBox.width;
          const ellipseHeight = annotationBox.height;
          page.drawEllipse({
            x: annotationBox.x + ellipseWidth / 2,
            y: annotationBox.y + ellipseHeight / 2,
            xScale: ellipseWidth / 2,
            yScale: ellipseHeight / 2,
            borderColor: ink,
            borderWidth: annotation.strokeWidth ?? 2,
          });
        }
        if (annotation.type === "line") {
          const topLeft = normalizedPointToPdf(
            { x: annotation.x, y: annotation.y },
            cropBox,
            rotation,
          );
          const topRight = normalizedPointToPdf(
            { x: annotation.x + annotation.width, y: annotation.y },
            cropBox,
            rotation,
          );
          const bottomLeft = normalizedPointToPdf(
            { x: annotation.x, y: annotation.y + annotation.height },
            cropBox,
            rotation,
          );
          const bottomRight = normalizedPointToPdf(
            {
              x: annotation.x + annotation.width,
              y: annotation.y + annotation.height,
            },
            cropBox,
            rotation,
          );
          page.drawLine({
            start:
              annotation.lineDirection === "up"
                ? bottomLeft
                : topLeft,
            end:
              annotation.lineDirection === "up"
                ? topRight
                : bottomRight,
            thickness: annotation.strokeWidth ?? 2,
            color: ink,
            lineCap: 1,
          });
        }
        if (annotation.type === "drawing" && annotation.points) {
          for (let index = 1; index < annotation.points.length; index += 1) {
            const start = annotation.points[index - 1];
            const end = annotation.points[index];
            page.drawLine({
              start: normalizedPointToPdf(start, cropBox, rotation),
              end: normalizedPointToPdf(end, cropBox, rotation),
              thickness: annotation.strokeWidth ?? 2.5,
              color: ink,
              lineCap: 1,
            });
          }
        }
        if (annotation.type === "signature" && annotation.strokes) {
          for (const stroke of annotation.strokes) {
            for (let index = 1; index < stroke.length; index += 1) {
              const start = stroke[index - 1];
              const end = stroke[index];
              page.drawLine({
                start: normalizedPointToPdf({ x: annotation.x + start.x * annotation.width, y: annotation.y + start.y * annotation.height }, cropBox, rotation),
                end: normalizedPointToPdf({ x: annotation.x + end.x * annotation.width, y: annotation.y + end.y * annotation.height }, cropBox, rotation),
                thickness: 1.8,
                color: ink,
                lineCap: 1,
              });
            }
          }
        }
      }

      const output = (await pdf.save({
        updateFieldAppearances: false,
      })) as Uint8Array<ArrayBuffer>;
      const blob = new Blob([output], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${fileName.replace(/\.pdf$/i, "")}-edited.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(
        "The edited PDF could not be exported. Your browser changes are still here.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  async function convertToHtml() {
    if (!document) return;
    setIsConvertingHtml(true);
    setHtmlProgress(0);
    setError("");
    try {
      const embeddedFontUrl = await bytesToDataUrl(
        await loadKhmerFontBytes(),
        "font/ttf",
      );
      const pages: string[] = [];
      for (let pageIndex = 1; pageIndex <= pageOrder.length; pageIndex += 1) {
        setHtmlProgress(pageIndex);
        const entry = pageOrder[pageIndex - 1];
        const page = await document.getPage(entry.sourcePage);
        const rotation = (page.rotate + entry.rotation) % 360;
        const baseViewport = page.getViewport({
          scale: 1,
          rotation,
        });
        const renderScale = Math.min(
          1.6,
          Math.max(1, 1200 / baseViewport.width),
        );
        const renderViewport = page.getViewport({
          scale: renderScale,
          rotation,
        });
        const canvas = window.document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        await page.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
        }).promise;

        const pageImage = canvas.toDataURL("image/webp", 0.92);
        const textContent = await page.getTextContent();
        const accessibleText = textContent.items
          .map((item) => item.str ?? "")
          .filter(Boolean)
          .join(" ");
        const overlay = annotations
          .filter((annotation) => annotation.page === pageIndex)
          .map((annotation) =>
            annotationToSvg(
              annotation,
              baseViewport.width,
              baseViewport.height,
            ),
          )
          .join("");

        pages.push(`<section class="page" aria-label="Page ${pageIndex}">
  <div class="paper" style="aspect-ratio:${baseViewport.width}/${baseViewport.height}">
    <img src="${pageImage}" alt="Page ${pageIndex}"/>
    <svg viewBox="0 0 ${baseViewport.width} ${baseViewport.height}" aria-hidden="true">${overlay}</svg>
  </div>
  <p class="page-number">Page ${pageIndex}</p>
  <p class="sr-only">${escapeHtml(accessibleText)}</p>
</section>`);
      }

      const title = fileName.replace(/\.pdf$/i, "") || "Converted PDF";
      const html = `<!doctype html>
<html lang="${annotations.some(annotationContainsKhmer) ? "km" : "en"}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @font-face{font-family:"PDF Studio Khmer";src:url("${embeddedFontUrl}") format("truetype");font-style:normal;font-weight:400;font-display:block}*{box-sizing:border-box}body{margin:0;background:#e2e8f0;color:#0f172a;font-family:"PDF Studio Khmer",Arial,sans-serif;font-variant-ligatures:common-ligatures contextual;text-rendering:optimizeLegibility}.document{display:grid;gap:32px;padding:32px 16px}.page{width:min(100%,900px);margin:auto}.paper{position:relative;overflow:hidden;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.18)}.paper img,.paper svg{position:absolute;inset:0;width:100%;height:100%}.paper img{display:block}.page-number{text-align:center;color:#64748b;font-size:12px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:640px){.document{gap:20px;padding:16px 8px}}@media print{body{background:#fff}.document{display:block;padding:0}.page{width:100%;page-break-after:always}.paper{box-shadow:none}.page-number{display:none}}
  </style>
</head>
<body><main class="document">${pages.join("\n")}</main></body>
</html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${title}-converted.html`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      console.error("Failed to convert PDF to HTML", cause);
      setError(
        "The HTML file could not be created. Your PDF and browser changes are still here.",
      );
    } finally {
      setIsConvertingHtml(false);
      setHtmlProgress(0);
    }
  }

  async function extractContent() {
    if (!document) return;
    setIsExtracting(true);
    setExtractionError("");
    setExtractionProgress({ current: 0, total: pageOrder.length });
    try {
      const result = await extractPdfContent({
        document: document as unknown as PdfDocumentForExtraction,
        fileName,
        pageOrder,
        editorAnnotations: annotations,
        onProgress(current, total) {
          setExtractionProgress({ current, total });
        },
      });
      setExtractionResult(result);
    } catch (cause) {
      console.error("Failed to extract PDF content", cause);
      setExtractionError(
        "This PDF could not be read completely. It may be encrypted, damaged, or use an unsupported content format.",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  if (!document) {
    return (
      <main className="upload-shell min-h-screen text-slate-950">
        <style>{`@font-face{font-family:"${KHMER_FONT_FAMILY}";src:url("${khmerFontUrl}") format("truetype");font-style:normal;font-weight:400;font-display:block}`}</style>
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
          <Brand />
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <LockKeyhole className="size-3.5 text-emerald-600" />
            Files stay on your device
          </div>
        </header>
        <section className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-6xl items-center justify-center px-5 pb-20 sm:px-8">
          <div className="grid w-full items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                <Check className="size-3.5" /> No sign-up. No upload to a
                server.
              </div>
              <h1 className="text-balance text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-6xl">
                Make changes to a PDF, right where it opens.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">
                Add text, fill fields, sign, highlight details, draw notes, and
                export a clean copy—all inside your browser.
              </p>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-500">
                <span className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-600" /> Private by
                  default
                </span>
                <span className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-600" /> Works on every
                  page
                </span>
                <span className="flex items-center gap-2">
                  <Check className="size-4 text-emerald-600" /> Export in one
                  click
                </span>
              </div>
            </div>

            <div
              className="upload-card relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 p-4 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-6"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) requestOpenFile(file);
              }}
            >
              <Empty className="min-h-[390px] rounded-[1.5rem] border-2 border-dashed border-blue-200 bg-gradient-to-b from-blue-50/80 to-white px-6">
                <EmptyHeader>
                  <EmptyMedia
                    className="size-16 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    variant="icon"
                  >
                    {isLoading ? (
                      <LoaderCircle className="size-7 animate-spin" />
                    ) : (
                      <UploadCloud className="size-7" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle className="mt-3 text-2xl font-semibold text-slate-900">
                    {isLoading ? "Opening your PDF…" : "Drop your PDF here"}
                  </EmptyTitle>
                  <EmptyDescription className="max-w-xs text-slate-500">
                    Or choose a file from your device. PDF files up to 35 MB are
                    supported.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {availableDraft && (
                    <div className="mb-3 w-full max-w-sm rounded-xl border border-blue-200 bg-blue-50 p-3 text-left">
                      <p className="truncate text-sm font-semibold text-slate-800">
                        Continue {availableDraft.fileName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(availableDraft.savedAt)}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" disabled={isLoading} onClick={() => void restoreDraft()} className="bg-blue-600 hover:bg-blue-700">
                          Restore draft
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => {
                          void removeDraft();
                          setAvailableDraft(null);
                        }}>
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}
                  <Button
                    type="button"
                    size="lg"
                    disabled={isLoading}
                    onClick={() => inputRef.current?.click()}
                    className="h-12 rounded-xl bg-blue-600 px-6 text-base shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                  >
                    <Plus className="size-4" /> Choose PDF
                  </Button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) requestOpenFile(file);
                    }}
                  />
                  {error && (
                    <p
                      role="alert"
                      className="mt-2 text-sm font-medium text-rose-600"
                    >
                      {error}
                    </p>
                  )}
                </EmptyContent>
              </Empty>
              <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-blue-200/50 blur-3xl" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <TooltipProvider>
      <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-950">
        <style>{`@font-face{font-family:"${KHMER_FONT_FAMILY}";src:url("${khmerFontUrl}") format("truetype");font-style:normal;font-weight:400;font-display:block}`}</style>
        <header className="z-20 flex min-h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2 sm:h-16 sm:px-5 sm:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <Brand compact />
            <div className="hidden h-7 w-px bg-slate-200 sm:block" />
            <div className="min-w-0">
              <p className="max-w-[180px] truncate text-sm font-semibold text-slate-800 sm:max-w-[320px]">
                {fileName}
              </p>
              <p className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
                {draftStatus === "saving" ? (
                  <LoaderCircle className="size-3 animate-spin text-blue-600" />
                ) : (
                  <Check className="size-3 text-emerald-600" />
                )}
                {draftStatus === "saving" ? "Saving draft…" : "Draft saved locally"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
              <Button
                type="button"
                variant={editorMode === "build" ? "default" : "ghost"}
                size="sm"
                onClick={() => setEditorMode("build")}
                className="h-7 px-2"
              >
                <Wrench className="size-3.5" />
                <span className="hidden md:inline">Build</span>
              </Button>
              <Button
                type="button"
                variant={editorMode === "fill" ? "default" : "ghost"}
                size="sm"
                onClick={() => {
                  setEditorMode("fill");
                  setTool("select");
                  setSelectedId(null);
                }}
                className="h-7 px-2"
              >
                <Eye className="size-3.5" />
                <span className="hidden md:inline">Fill</span>
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title="Keyboard shortcuts"
              aria-label="Open keyboard shortcuts"
              onClick={() => setShortcutsOpen(true)}
              className="px-2 text-slate-600 sm:px-3"
            >
              <Keyboard className="size-4" />
              <span className="hidden lg:inline">Shortcuts</span>
            </Button>
            <Button asChild type="button" variant="ghost" size="sm" className="hidden text-slate-600 lg:flex">
              <a href="/templates">
                <FolderOpen className="size-4" /> Templates
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!templateName) {
                  setTemplateName(fileName.replace(/\.pdf$/iu, "") || "Untitled template");
                }
                setCreatedShareLinks([]);
                setTemplateOpen(true);
              }}
              className="px-2 sm:px-3"
            >
              <Save className="size-4" />
              <span className="hidden lg:inline">Save template</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden text-slate-600 sm:flex"
              onClick={() => inputRef.current?.click()}
            >
              <RotateCcw className="size-4" /> Replace
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) requestOpenFile(file);
                event.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Extract PDF content"
              aria-label="Extract PDF content"
              disabled={isExtracting || isConvertingHtml || isExporting}
              onClick={() => {
                setExtractionOpen(true);
                if (!extractionResult) void extractContent();
              }}
              className="px-2 sm:px-3"
            >
              {isExtracting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileSearch className="size-4" />
              )}
              <span className="hidden xl:inline">Extract</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Convert PDF to HTML"
              aria-label="Convert PDF to HTML"
              disabled={isConvertingHtml || isExporting || isExtracting}
              onClick={() => void convertToHtml()}
              className="px-2 sm:px-3"
            >
              {isConvertingHtml ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileCode2 className="size-4" />
              )}
              <span className="hidden md:inline">
                {isConvertingHtml && htmlProgress
                  ? `HTML ${htmlProgress}/${pageOrder.length}`
                  : "Convert to HTML"}
              </span>
            </Button>
            <Button
              type="button"
              size="sm"
              title="Save fillable PDF"
              aria-label="Save fillable PDF"
              disabled={isExporting || isConvertingHtml || isExtracting}
              onClick={() => void exportPdf()}
              className="bg-blue-600 shadow-sm hover:bg-blue-700"
            >
              {isExporting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              <span className="hidden sm:inline">Save PDF</span>
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-40 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 md:flex">
            <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pages
              </span>
              <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                {pageOrder.length}
              </span>
            </div>
            <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
              {pageOrder.map((entry, index) => (
                <PageThumbnail
                  key={entry.id}
                  document={document}
                  entry={entry}
                  displayNumber={index + 1}
                  active={pageNumber === index + 1}
                  onClick={() => {
                    setPageNumber(index + 1);
                    setSelectedId(null);
                  }}
                  onMoveUp={() => moveCurrentPage(-1)}
                  onMoveDown={() => moveCurrentPage(1)}
                  onRotate={rotateCurrentPage}
                  onDuplicate={duplicateCurrentPage}
                  onDelete={deleteCurrentPage}
                  onDropPage={(draggedId) => reorderPage(draggedId, entry.id)}
                />
              ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <div className="z-10 flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-2 py-2 shadow-sm sm:min-h-14 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4">
              <div className={`scrollbar-none flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 sm:w-auto sm:max-w-full sm:rounded-lg ${editorMode === "fill" ? "pointer-events-none opacity-45" : ""}`}>
                <ToolButton
                  label="Select"
                  shortcut="A"
                  active={tool === "select"}
                  onClick={() => setTool("select")}
                >
                  <MousePointer2 />
                </ToolButton>
                <ToolButton
                  label="Pan document"
                  shortcut="H"
                  active={tool === "pan"}
                  onClick={() => setTool("pan")}
                >
                  <Hand />
                </ToolButton>
                <ToolButton
                  label="Add text"
                  shortcut="T"
                  active={tool === "text"}
                  onClick={() => setTool("text")}
                >
                  <Type />
                </ToolButton>
                <ToolButton
                  label="Highlight"
                  shortcut="G"
                  active={tool === "highlight"}
                  onClick={() => {
                    setColor("#facc15");
                    setTool("highlight");
                  }}
                >
                  <Highlighter />
                </ToolButton>
                <ToolButton
                  label="Draw"
                  shortcut="P"
                  active={tool === "pen"}
                  onClick={() => setTool("pen")}
                >
                  <PenLine />
                </ToolButton>
                <ToolButton
                  label="Rectangle"
                  shortcut="R"
                  active={tool === "rectangle"}
                  onClick={() => setTool("rectangle")}
                >
                  <Square />
                </ToolButton>
                <ToolButton
                  label="Text input"
                  shortcut="I"
                  active={tool === "input"}
                  onClick={() => setTool("input")}
                >
                  <TextCursorInput />
                </ToolButton>
                <ToolButton
                  label="Dropdown"
                  shortcut="V"
                  active={tool === "dropdown"}
                  onClick={() => setTool("dropdown")}
                >
                  <ListFilter />
                </ToolButton>
                <ToolButton
                  label="Cambodia address"
                  shortcut="K"
                  active={tool === "cambodia-address"}
                  onClick={() => setTool("cambodia-address")}
                >
                  <MapPinned />
                </ToolButton>
                <ToolButton
                  label="Checkbox"
                  shortcut="C"
                  active={tool === "checkbox"}
                  onClick={() => setTool("checkbox")}
                >
                  <CheckSquare2 />
                </ToolButton>
                <ToolButton
                  label="Radio button"
                  shortcut="O"
                  active={tool === "radio"}
                  onClick={() => setTool("radio")}
                >
                  <CircleDot />
                </ToolButton>
                <ToolButton
                  label="Checkbox group"
                  shortcut="B"
                  active={tool === "checkbox-group"}
                  onClick={() => setTool("checkbox-group")}
                >
                  <CheckSquare2 />
                </ToolButton>
                <ToolButton
                  label="Radio group"
                  shortcut="Q"
                  active={tool === "radio-group"}
                  onClick={() => setTool("radio-group")}
                >
                  <CircleDot />
                </ToolButton>
                <ToolButton
                  label={
                    pendingSignature ? "Place signature" : "Add signature"
                  }
                  shortcut="S"
                  active={tool === "signature"}
                  onClick={() => setSignatureOpen(true)}
                >
                  <Signature />
                </ToolButton>
                <ToolButton
                  label="Add date"
                  shortcut="D"
                  active={tool === "date"}
                  onClick={() => setTool("date")}
                >
                  <CalendarDays />
                </ToolButton>
                <ToolButton
                  label="Add initials"
                  shortcut="N"
                  active={tool === "initials"}
                  onClick={() => setTool("initials")}
                >
                  <Type />
                </ToolButton>
                <ToolButton
                  label="Ellipse"
                  shortcut="E"
                  active={tool === "ellipse"}
                  onClick={() => setTool("ellipse")}
                >
                  <Circle />
                </ToolButton>
                <ToolButton
                  label="Line"
                  shortcut="L"
                  active={tool === "line"}
                  onClick={() => setTool("line")}
                >
                  <Minus />
                </ToolButton>
                <ToolButton
                  label="Upload image"
                  shortcut="U"
                  disabled={isAddingImage}
                  onClick={() => chooseImage()}
                >
                  {isAddingImage ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <ImagePlus />
                  )}
                </ToolButton>
                <ToolButton
                  label="Image placeholder"
                  shortcut="M"
                  active={tool === "image-placeholder"}
                  onClick={() => setTool("image-placeholder")}
                >
                  <UploadCloud />
                </ToolButton>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    const targetId = imageTargetRef.current;
                    imageTargetRef.current = null;
                    if (file) void addImage(file, targetId);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-start">
                <ToolButton
                  label="Undo"
                  shortcut="Ctrl+Z"
                  disabled={!undoStack.length}
                  onClick={undo}
                >
                  <Undo2 />
                </ToolButton>
                <ToolButton
                  label="Redo"
                  shortcut="Ctrl+Shift+Z"
                  disabled={!redoStack.length}
                  onClick={redo}
                >
                  <Redo2 />
                </ToolButton>
                <div className="mx-1 h-6 w-px bg-slate-200" />
                <ToolButton
                  label="Fit page to screen"
                  active={fitMode}
                  onClick={fitToScreen}
                >
                  <Maximize2 />
                </ToolButton>
                <ToolButton
                  label="Zoom out"
                  disabled={zoom <= MIN_ZOOM}
                  onClick={() => setManualZoom(zoom - 0.15)}
                >
                  <ZoomOut />
                </ToolButton>
                <input
                  type="range"
                  aria-label="Zoom level"
                  min={MIN_ZOOM * 100}
                  max={MAX_ZOOM * 100}
                  step="5"
                  value={Math.round(zoom * 100)}
                  onChange={(event) =>
                    setManualZoom(Number(event.target.value) / 100)
                  }
                  className="hidden w-24 cursor-ew-resize accent-blue-600 sm:block"
                />
                <span className="w-11 text-center text-xs font-semibold tabular-nums text-slate-500">
                  {Math.round(zoom * 100)}%
                </span>
                <ToolButton
                  label="Zoom in"
                  disabled={zoom >= MAX_ZOOM}
                  onClick={() => setManualZoom(zoom + 0.15)}
                >
                  <ZoomIn />
                </ToolButton>
              </div>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="text-xs font-medium text-slate-400">Ink</span>
                <ColorControl
                  compact
                  value={color}
                  onChange={setColor}
                />
              </div>
            </div>

            {editorMode === "fill" && (
              <div className="flex shrink-0 items-center justify-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-800">
                <Eye className="size-3.5" /> Fill fields directly, then save the completed PDF. Switch to Build to move or add tools.
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-center text-xs font-medium text-rose-700"
              >
                {error}
              </div>
            )}

            {selectedAnnotation && (
              <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 xl:hidden">
                <span className="shrink-0 text-xs font-semibold capitalize text-slate-500">
                  {selectedAnnotation.type}
                </span>
                {(selectedAnnotation.type === "text" ||
                  selectedAnnotation.type === "input" ||
                  selectedAnnotation.type === "date" ||
                  selectedAnnotation.type === "initials") && (
                  <input
                    type={selectedAnnotation.type === "date" ? "date" : "text"}
                    aria-label={
                      selectedAnnotation.type === "input"
                        ? "Input value"
                        : selectedAnnotation.type === "date"
                          ? "Date value"
                          : selectedAnnotation.type === "initials"
                            ? "Initials value"
                            : "Annotation text"
                    }
                    value={selectedAnnotation.text}
                    onChange={(event) =>
                      updateSelected({ text: event.target.value })
                    }
                    className="h-8 min-w-40 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-blue-500"
                  />
                )}
                {(selectedAnnotation.type === "text" ||
                  selectedAnnotation.type === "input" ||
                  selectedAnnotation.type === "date" ||
                  selectedAnnotation.type === "initials" ||
                  selectedAnnotation.type === "cambodia-address") && (
                  <FontSizeControl
                    compact
                    value={selectedAnnotation.fontSize ?? 16}
                    onChange={(fontSize) => updateSelected({ fontSize })}
                  />
                )}
                {(selectedAnnotation.type === "checkbox" ||
                  selectedAnnotation.type === "radio") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateSelected({ checked: !selectedAnnotation.checked })
                    }
                  >
                    {selectedAnnotation.checked ? "Selected" : "Unselected"}
                  </Button>
                )}
                {(selectedAnnotation.type === "checkbox-group" ||
                  selectedAnnotation.type === "radio-group" ||
                  selectedAnnotation.type === "dropdown") && (
                  <GroupFieldEditor
                    compact
                    annotation={selectedAnnotation}
                    onChange={updateSelected}
                  />
                )}
                {selectedAnnotation.type === "cambodia-address" && (
                  <GazetteerFieldEditor
                    compact
                    annotation={selectedAnnotation}
                    onChange={updateSelected}
                  />
                )}
                {selectedAnnotation.type === "image-placeholder" && (
                  <>
                    <input
                      aria-label="Image placeholder label"
                      value={selectedAnnotation.label ?? ""}
                      onChange={(event) =>
                        updateSelected({ label: event.target.value })
                      }
                      className="h-8 w-36 rounded-md border border-slate-200 bg-slate-50 px-2 text-sm outline-none focus:border-blue-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => chooseImage(selectedAnnotation.id)}
                    >
                      <ImagePlus className="size-3.5" />
                      {selectedAnnotation.imageData ? "Replace" : "Choose"}
                    </Button>
                  </>
                )}
                {selectedAnnotation.type !== "image" && (
                  <ColorControl
                    compact
                    value={selectedAnnotation.color}
                    onChange={(selectedColor) =>
                      updateSelected({ color: selectedColor })
                    }
                  />
                )}
                {(selectedAnnotation.type === "input" ||
                  selectedAnnotation.type === "cambodia-address") && (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Border
                    </span>
                    <ColorControl
                      compact
                      value={
                        selectedAnnotation.borderColor ?? "#64748b"
                      }
                      onChange={(borderColor) =>
                        updateSelected({ borderColor })
                      }
                    />
                  </div>
                )}
                {(isInteractivePdfField(selectedAnnotation.type) ||
                  selectedAnnotation.type === "checkbox-group" ||
                  selectedAnnotation.type === "radio-group" ||
                  selectedAnnotation.type === "image-placeholder") && (
                  <>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <input type="checkbox" checked={selectedAnnotation.required ?? false} onChange={(event) => updateSelected({ required: event.target.checked })} className="size-4 accent-blue-600" />
                      Required
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={duplicateSelectedAcrossPages} disabled={pageOrder.length < 2}>
                      <Copy className="size-3.5" /> All pages
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={deleteSelected}
                  aria-label="Delete annotation"
                  className="ml-auto shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 />
                </Button>
              </div>
            )}

            <div
              ref={viewportRef}
              className="scrollbar-thin relative flex flex-1 overscroll-contain overflow-auto bg-[radial-gradient(circle_at_1px_1px,#cbd5e1_1px,transparent_0)] bg-[size:18px_18px] p-3 sm:p-10"
            >
              <div className="m-auto">
                <div
                  ref={surfaceRef}
                  onPointerDownCapture={handleTouchPointerDown}
                  onPointerMoveCapture={handleTouchPointerMove}
                  onPointerUpCapture={handleTouchPointerEnd}
                  onPointerCancelCapture={handleTouchPointerEnd}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`pdf-surface relative overflow-hidden bg-white shadow-2xl shadow-slate-900/15 ${
                    tool === "pan" || isSpacePressed
                      ? "cursor-grab active:cursor-grabbing"
                      : tool !== "select"
                        ? "cursor-crosshair"
                        : "cursor-default"
                  }`}
                  style={{
                    width: pageSize.width,
                    height: pageSize.height,
                    transform:
                      pinchScale === 1 ? undefined : `scale(${pinchScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0 size-full"
                  />
                  {labelBindingFieldId && annotations.some((annotation) => annotation.id === labelBindingFieldId && annotation.page === pageNumber) && pdfTextRuns.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      title={`Bind label: ${run.text}`}
                      aria-label={`Bind PDF label ${run.text}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        bindPdfLabel(run);
                      }}
                      className="absolute z-30 cursor-pointer rounded-sm border border-blue-500 bg-blue-300/25 transition hover:bg-amber-300/60 focus-visible:outline-2 focus-visible:outline-blue-700"
                      style={{
                        left: `${run.rect.x * 100}%`,
                        top: `${run.rect.y * 100}%`,
                        width: `${run.rect.width * 100}%`,
                        height: `${run.rect.height * 100}%`,
                      }}
                    />
                  ))}
                  {pageAnnotations.map((annotation) => {
                    const selected = annotation.id === selectedId;
                    if (annotation.type === "drawing") {
                      const points = annotation.points ?? [];
                      return (
                        <svg
                          key={annotation.id}
                          className="pointer-events-none absolute inset-0 size-full overflow-visible"
                          viewBox="0 0 1000 1000"
                          preserveAspectRatio="none"
                        >
                          <polyline
                            points={points
                              .map(
                                (point) =>
                                  `${point.x * 1000},${point.y * 1000}`,
                              )
                              .join(" ")}
                            fill="none"
                            stroke={annotation.color}
                            strokeWidth={
                              (annotation.strokeWidth ?? 2.5) * 1.3 * zoom
                            }
                            vectorEffect="non-scaling-stroke"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            onPointerDown={(event) =>
                              startAnnotationInteraction(
                                event,
                                annotation,
                                "move",
                              )
                            }
                            className={`pointer-events-auto cursor-move ${
                              selected
                                ? "drop-shadow-[0_0_2px_rgba(37,99,235,.7)]"
                                : ""
                            }`}
                          />
                        </svg>
                      );
                    }
                    return (
                      <div
                        key={annotation.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select ${annotation.type} annotation`}
                        onPointerDown={(event) =>
                          startAnnotationInteraction(event, annotation, "move")
                        }
                        onDoubleClick={() => activateAnnotation(annotation)}
                        className={`absolute block text-left ${
                          editorMode === "build" ? "cursor-move" : "cursor-default"
                        } ${selected ? "annotation-selected" : ""} ${
                          invalidFieldIds.includes(annotation.id)
                            ? "ring-2 ring-rose-500 ring-offset-1"
                            : ""
                        }`}
                        style={{
                          left: `${annotation.x * 100}%`,
                          top: `${annotation.y * 100}%`,
                          width: `${annotation.width * 100}%`,
                          height: `${annotation.height * 100}%`,
                        }}
                      >
                        {(annotation.type === "text" ||
                          annotation.type === "initials") && (
                          annotation.type === "initials" && editorMode === "fill" ? (
                            <input
                              value={annotation.text ?? ""}
                              placeholder={annotation.placeholder ?? "Initials"}
                              required={annotation.required}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) => updateAnnotationValue(annotation.id, { text: event.target.value })}
                              className="size-full border-0 bg-transparent outline-none"
                              style={{ color: annotation.color, fontSize: (annotation.fontSize ?? 16) * zoom }}
                            />
                          ) : (
                          <span
                            lang={
                              containsKhmer(annotation.text) ? "km" : undefined
                            }
                            className="block whitespace-pre-wrap leading-tight"
                            style={{
                              color: annotation.color,
                              fontSize: (annotation.fontSize ?? 16) * zoom,
                              lineHeight: containsKhmer(annotation.text)
                                ? 1.55
                                : 1.25,
                            }}
                          >
                            {annotation.text}
                          </span>
                          )
                        )}
                        {annotation.type === "date" && (
                          editorMode === "fill" ? (
                            <input
                              type="date"
                              value={annotation.text ?? ""}
                              required={annotation.required}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                updateAnnotationValue(annotation.id, {
                                  text: event.target.value,
                                })
                              }
                              className="size-full rounded-md border border-slate-400 bg-white px-2"
                              style={{ color: annotation.color, fontSize: (annotation.fontSize ?? 14) * zoom }}
                            />
                          ) : (
                            <span className="flex size-full items-center gap-2 overflow-hidden rounded-md border border-slate-400 bg-white px-2 leading-none shadow-sm" style={{ color: annotation.color, fontSize: (annotation.fontSize ?? 14) * zoom, borderWidth: Math.max(0.75, zoom) }}>
                              <span className="min-w-0 flex-1 truncate">{formatDateValue(annotation.text)}</span>
                              <CalendarDays className="size-4 shrink-0 text-slate-500" />
                            </span>
                          )
                        )}
                        {annotation.type === "highlight" && (
                          <span
                            className="block size-full"
                            style={{
                              backgroundColor: annotation.color,
                              opacity: 0.35,
                            }}
                          />
                        )}
                        {annotation.type === "rectangle" && (
                          <span
                            className="block size-full"
                            style={{
                              border: `${(annotation.strokeWidth ?? 2) * zoom}px solid ${annotation.color}`,
                            }}
                          />
                        )}
                        {annotation.type === "ellipse" && (
                          <span
                            className="block size-full rounded-full"
                            style={{
                              border: `${(annotation.strokeWidth ?? 2) * zoom}px solid ${annotation.color}`,
                            }}
                          />
                        )}
                        {annotation.type === "line" && (
                          <svg
                            viewBox="0 0 1000 1000"
                            preserveAspectRatio="none"
                            className="size-full overflow-visible"
                            aria-hidden="true"
                          >
                            <line
                              x1="0"
                              y1={
                                annotation.lineDirection === "up" ? 1000 : 0
                              }
                              x2="1000"
                              y2={
                                annotation.lineDirection === "up" ? 0 : 1000
                              }
                              stroke={annotation.color}
                              strokeWidth={(annotation.strokeWidth ?? 2) * zoom}
                              vectorEffect="non-scaling-stroke"
                              strokeLinecap="round"
                            />
                          </svg>
                        )}
                        {annotation.type === "input" && (
                          editorMode === "fill" ? (
                            annotation.multiline ? (
                              <textarea
                                value={annotation.text ?? ""}
                                placeholder={annotation.placeholder}
                                required={annotation.required}
                                onPointerDown={(event) => event.stopPropagation()}
                                onChange={(event) => updateAnnotationValue(annotation.id, { text: event.target.value })}
                                className="size-full resize-none rounded-sm border bg-white px-1.5 py-1 outline-none"
                                style={{ color: annotation.color, fontSize: (annotation.fontSize ?? 14) * zoom, borderColor: annotation.borderColor ?? "#64748b" }}
                              />
                            ) : (
                              <input
                                type={annotation.validation === "email" ? "email" : annotation.validation === "number" ? "number" : "text"}
                                value={annotation.text ?? ""}
                                placeholder={annotation.placeholder}
                                required={annotation.required}
                                onPointerDown={(event) => event.stopPropagation()}
                                onChange={(event) => updateAnnotationValue(annotation.id, { text: event.target.value })}
                                className="size-full rounded-sm border bg-white px-1.5 outline-none"
                                style={{ color: annotation.color, fontSize: (annotation.fontSize ?? 14) * zoom, borderColor: annotation.borderColor ?? "#64748b" }}
                              />
                            )
                          ) : (
                          <span
                            lang={
                              containsKhmer(annotation.text) ? "km" : undefined
                            }
                            className="flex size-full items-center overflow-hidden rounded-sm border border-slate-400 bg-white px-1.5 leading-none"
                            style={{
                              color: annotation.color,
                              fontSize: (annotation.fontSize ?? 14) * zoom,
                              borderColor:
                                annotation.borderColor ?? "#64748b",
                              borderWidth: Math.max(0.75, zoom),
                              lineHeight: containsKhmer(annotation.text)
                                ? 1.55
                                : 1,
                            }}
                          >
                            <span className="truncate">
                              {annotation.text || "Text input"}
                            </span>
                          </span>
                          )
                        )}
                        {annotation.type === "dropdown" && (
                          editorMode === "fill" ? (
                            <select
                              value={annotation.options?.find((option) => option.checked)?.id ?? ""}
                              required={annotation.required}
                              onPointerDown={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                updateAnnotationValue(annotation.id, {
                                  options: (annotation.options ?? []).map((option) => ({ ...option, checked: option.id === event.target.value })),
                                })
                              }
                              className="size-full rounded-md border bg-white px-2 outline-none"
                              style={{ color: annotation.color, borderColor: annotation.borderColor ?? "#64748b", fontSize: (annotation.fontSize ?? 14) * zoom }}
                            >
                              <option value="">{annotation.label || "Select an option"}</option>
                              {(annotation.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </select>
                          ) : (
                            <span className="flex size-full items-center justify-between rounded-md border bg-white px-2" style={{ color: annotation.color, borderColor: annotation.borderColor ?? "#64748b", fontSize: (annotation.fontSize ?? 14) * zoom }}>
                              <span className="truncate">{annotation.options?.find((option) => option.checked)?.label ?? annotation.label ?? "Select an option"}</span><ChevronRight className="size-3 rotate-90" />
                            </span>
                          )
                        )}
                        {annotation.type === "cambodia-address" && (
                          <div
                            className="size-full"
                            onPointerDown={
                              editorMode === "fill"
                                ? (event) => event.stopPropagation()
                                : undefined
                            }
                          >
                            <CambodiaAddressField
                              value={annotation.address}
                              language={annotation.gazetteerLanguage ?? "bilingual"}
                              deepestLevel={annotation.gazetteerLevel ?? "village"}
                              disabled={editorMode !== "fill"}
                              required={annotation.required}
                              label={annotation.label}
                              onChange={(address) =>
                                updateAnnotationValue(annotation.id, {
                                  address,
                                  text: formatCambodiaAddress(
                                    address,
                                    annotation.gazetteerLanguage ?? "bilingual",
                                  ),
                                })
                              }
                              style={{
                                color: annotation.color,
                                borderColor:
                                  annotation.borderColor ?? "#64748b",
                                fontSize: (annotation.fontSize ?? 11) * zoom,
                              }}
                            />
                          </div>
                        )}
                        {annotation.type === "checkbox" && (
                          <button
                            type="button"
                            disabled={editorMode !== "fill"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => updateAnnotationValue(annotation.id, { checked: !annotation.checked })}
                            className="flex size-full items-center justify-center rounded-[2px] bg-white"
                            style={{
                              borderColor: annotation.color,
                              borderWidth: Math.max(1, 1.5 * zoom),
                              borderStyle: "solid",
                            }}
                          >
                            {annotation.checked && (
                              <Check
                                className="size-full"
                                style={{ color: annotation.color }}
                                strokeWidth={3}
                              />
                            )}
                          </button>
                        )}
                        {annotation.type === "radio" && (
                          <button
                            type="button"
                            disabled={editorMode !== "fill"}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => updateAnnotationValue(annotation.id, { checked: !annotation.checked })}
                            className="flex size-full items-center justify-center rounded-full bg-white"
                            style={{
                              borderColor: annotation.color,
                              borderWidth: Math.max(1, 1.5 * zoom),
                              borderStyle: "solid",
                            }}
                          >
                            {annotation.checked && (
                              <span
                                className="size-1/2 rounded-full"
                                style={{ backgroundColor: annotation.color }}
                              />
                            )}
                          </button>
                        )}
                        {(annotation.type === "checkbox-group" ||
                          annotation.type === "radio-group") && (
                          <span
                            className="flex size-full flex-col overflow-hidden rounded-md bg-white/95 text-slate-800"
                            style={{ padding: 6 * zoom }}
                          >
                            <span
                              lang={
                                containsKhmer(annotation.label)
                                  ? "km"
                                  : undefined
                              }
                              className="truncate font-semibold leading-tight"
                              style={{
                                fontSize: 14 * zoom,
                                lineHeight: containsKhmer(annotation.label)
                                  ? 1.55
                                  : 1.25,
                              }}
                            >
                              {annotation.label || "Options"}
                            </span>
                            <span
                              className="flex min-h-0 flex-1 flex-col justify-around"
                              style={{ marginTop: 4 * zoom, gap: 2 * zoom }}
                            >
                              {(annotation.options ?? []).map((option) => (
                                <button
                                  type="button"
                                  disabled={editorMode !== "fill"}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => updateAnnotationValue(annotation.id, {
                                    options: (annotation.options ?? []).map((item) => ({
                                      ...item,
                                      checked: item.id === option.id
                                        ? annotation.type === "radio-group" ? true : !item.checked
                                        : annotation.type === "radio-group" ? false : item.checked,
                                    })),
                                  })}
                                  key={option.id}
                                  lang={
                                    containsKhmer(option.label)
                                      ? "km"
                                      : undefined
                                  }
                                  className="flex min-w-0 items-center leading-none"
                                  style={{
                                    gap: 6 * zoom,
                                    fontSize: 12 * zoom,
                                    lineHeight: containsKhmer(option.label)
                                      ? 1.55
                                      : 1,
                                  }}
                                >
                                  <span
                                    className={`flex shrink-0 items-center justify-center bg-white ${annotation.type === "radio-group" ? "rounded-full" : "rounded-[3px]"}`}
                                    style={{
                                      width: 16 * zoom,
                                      height: 16 * zoom,
                                      borderColor: annotation.color,
                                      borderWidth: Math.max(1, 2 * zoom),
                                      borderStyle: "solid",
                                    }}
                                  >
                                    {option.checked &&
                                      (annotation.type === "radio-group" ? (
                                        <span
                                          className="size-2 rounded-full"
                                          style={{
                                            backgroundColor: annotation.color,
                                          }}
                                        />
                                      ) : (
                                        <Check
                                          className="size-3.5"
                                          style={{ color: annotation.color }}
                                          strokeWidth={3}
                                        />
                                      ))}
                                  </span>
                                  <span className="truncate">
                                    {option.label}
                                  </span>
                                </button>
                              ))}
                            </span>
                          </span>
                        )}
                        {annotation.type === "signature" && (
                          <svg
                            viewBox="0 0 1000 320"
                            preserveAspectRatio="none"
                            className="size-full overflow-visible"
                            aria-hidden="true"
                          >
                            {(annotation.strokes ?? []).map(
                              (stroke, index) => (
                                <polyline
                                  key={index}
                                  points={stroke
                                    .map(
                                      (point) =>
                                        `${point.x * 1000},${point.y * 320}`,
                                    )
                                    .join(" ")}
                                  fill="none"
                                  stroke={annotation.color}
                                  strokeWidth={2.5 * zoom}
                                  vectorEffect="non-scaling-stroke"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              ),
                            )}
                          </svg>
                        )}
                        {annotation.type === "image" &&
                          annotation.imageData && (
                            <Image
                              src={annotation.imageData}
                              alt={annotation.imageName || "Uploaded image"}
                              fill
                              unoptimized
                              draggable={false}
                              className="pointer-events-none size-full select-none object-fill"
                            />
                          )}
                        {annotation.type === "image-placeholder" && (
                          <span className="relative flex size-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-400 bg-slate-50 text-slate-600">
                            {annotation.imageData ? (
                              <Image
                                src={annotation.imageData}
                                alt={annotation.imageName || "Uploaded image"}
                                fill
                                unoptimized
                                draggable={false}
                                className="pointer-events-none size-full select-none object-fill"
                              />
                            ) : (
                              <span className="flex flex-col items-center gap-1 px-3 text-center">
                                <UploadCloud className="size-6" />
                                <span className="text-xs font-semibold">
                                  {annotation.label || "Upload image"}
                                </span>
                              </span>
                            )}
                            {(selected || editorMode === "fill") && (
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  chooseImage(annotation.id);
                                }}
                                className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-slate-900/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow hover:bg-slate-900"
                              >
                                {annotation.imageData ? "Replace" : "Choose image"}
                              </button>
                            )}
                          </span>
                        )}
                        {selected && editorMode === "build" && (
                          <span
                            role="button"
                            aria-label={`Resize ${annotation.type} annotation`}
                            onPointerDown={(event) =>
                              startAnnotationInteraction(
                                event,
                                annotation,
                                "resize",
                              )
                            }
                            className="absolute -bottom-2 -right-2 size-4 cursor-nwse-resize rounded-full border-2 border-white bg-blue-600 shadow"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-center gap-3 text-xs font-medium text-slate-500 md:hidden">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={pageNumber === 1}
                    onClick={() => setPageNumber((value) => value - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  Page {pageNumber} of {pageOrder.length}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={pageNumber === pageOrder.length}
                    onClick={() => setPageNumber((value) => value + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
                {editorMode === "build" && (
                  <div className="mt-2 flex items-center justify-center gap-1 md:hidden">
                    <Button type="button" variant="ghost" size="sm" onClick={() => moveCurrentPage(-1)} disabled={pageNumber === 1}><ArrowUp className="size-3.5" /> Move</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={rotateCurrentPage}><RotateCw className="size-3.5" /> Rotate</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={duplicateCurrentPage}><Copy className="size-3.5" /> Copy</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={deleteCurrentPage} disabled={pageOrder.length <= 1} className="text-rose-600"><Trash2 className="size-3.5" /></Button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="hidden w-64 shrink-0 border-l border-slate-200 bg-white xl:block">
            <div className="flex h-12 items-center border-b border-slate-200 px-5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Properties
              </span>
            </div>
            {selectedAnnotation ? (
              <div className="space-y-6 p-5">
                <div>
                  <p className="text-xs font-semibold capitalize text-slate-700">
                    {selectedAnnotation.type}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Page {selectedAnnotation.page} · Select another tool to add
                    more.
                  </p>
                </div>
                {(selectedAnnotation.type === "text" ||
                  selectedAnnotation.type === "input" ||
                  selectedAnnotation.type === "initials") && (
                  <label className="block text-xs font-semibold text-slate-600">
                    {selectedAnnotation.type === "input"
                      ? "Value"
                      : selectedAnnotation.type === "initials"
                          ? "Initials"
                          : "Text"}
                    <textarea
                      value={selectedAnnotation.text}
                      onChange={(event) =>
                        updateSelected({ text: event.target.value })
                      }
                      rows={4}
                      className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                )}
                {selectedAnnotation.type === "date" && (
                  <label className="block text-xs font-semibold text-slate-600">
                    Date
                    <div className="relative mt-2">
                      <input
                        type="date"
                        value={selectedAnnotation.text ?? ""}
                        onChange={(event) =>
                          updateSelected({ text: event.target.value })
                        }
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm font-normal text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <CalendarDays className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    </div>
                    <span className="mt-1.5 block font-normal text-slate-400">
                      {formatDateValue(selectedAnnotation.text)}
                    </span>
                  </label>
                )}
                {(selectedAnnotation.type === "text" ||
                  selectedAnnotation.type === "input" ||
                  selectedAnnotation.type === "date" ||
                  selectedAnnotation.type === "initials" ||
                  selectedAnnotation.type === "cambodia-address") && (
                  <div>
                    <p className="mb-3 text-xs font-semibold text-slate-600">
                      Font size
                    </p>
                    <FontSizeControl
                      value={selectedAnnotation.fontSize ?? 16}
                      onChange={(fontSize) => updateSelected({ fontSize })}
                    />
                  </div>
                )}
                {(selectedAnnotation.type === "checkbox" ||
                  selectedAnnotation.type === "radio") && (
                  <label className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                    Selected
                    <input
                      type="checkbox"
                      aria-label={`Toggle ${selectedAnnotation.type}`}
                      checked={selectedAnnotation.checked ?? false}
                      onChange={(event) =>
                        updateSelected({ checked: event.target.checked })
                      }
                      className="size-4 accent-blue-600"
                    />
                  </label>
                )}
                {(selectedAnnotation.type === "checkbox-group" ||
                  selectedAnnotation.type === "radio-group" ||
                  selectedAnnotation.type === "dropdown") && (
                  <div>
                    <p className="mb-3 text-xs font-semibold text-slate-600">
                      {selectedAnnotation.type === "dropdown"
                        ? "Placeholder and options"
                        : "Group label and options"}
                    </p>
                    <GroupFieldEditor
                      annotation={selectedAnnotation}
                      onChange={updateSelected}
                    />
                  </div>
                )}
                {selectedAnnotation.type === "cambodia-address" && (
                  <div>
                    <p className="mb-3 text-xs font-semibold text-slate-600">
                      Cambodia address
                    </p>
                    <GazetteerFieldEditor
                      annotation={selectedAnnotation}
                      onChange={updateSelected}
                    />
                  </div>
                )}
                {(isInteractivePdfField(selectedAnnotation.type) ||
                  selectedAnnotation.type === "checkbox-group" ||
                  selectedAnnotation.type === "radio-group" ||
                  selectedAnnotation.type === "image-placeholder") && (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700">Field settings</p>
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Recipient
                      <select
                        value={selectedAnnotation.recipientRoleId ?? recipientRoles[0]?.id ?? ""}
                        onChange={(event) => updateSelected({ recipientRoleId: event.target.value })}
                        className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-blue-500"
                      >
                        {recipientRoles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Field name
                      <input
                        value={selectedAnnotation.fieldName ?? ""}
                        onChange={(event) => updateSelected({ fieldName: event.target.value })}
                        placeholder="Customer name"
                        className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="block text-[11px] font-semibold text-slate-500">
                      Field key
                      <input
                        value={selectedAnnotation.fieldKey ?? createFieldKey(selectedAnnotation.fieldName || selectedAnnotation.label || selectedAnnotation.type)}
                        onChange={(event) => updateSelected({ fieldKey: createFieldKey(event.target.value) })}
                        placeholder="customer_name"
                        className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-xs font-normal text-slate-800 outline-none focus:border-blue-500"
                      />
                    </label>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-slate-600">PDF label</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            {selectedAnnotation.labelBinding?.text || "No label bound"}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={startLabelBinding}>
                          <MousePointer2 className="size-3.5" />
                          {selectedAnnotation.labelBinding ? "Change" : "Bind"}
                        </Button>
                      </div>
                      {selectedAnnotation.labelBinding && (
                        <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 px-2 text-rose-600" onClick={() => updateSelected({ labelBinding: undefined })}>
                          Remove binding
                        </Button>
                      )}
                    </div>
                    {(selectedAnnotation.type === "input" || selectedAnnotation.type === "initials") && (
                      <label className="block text-[11px] font-semibold text-slate-500">
                        Placeholder
                        <input
                          value={selectedAnnotation.placeholder ?? ""}
                          onChange={(event) => updateSelected({ placeholder: event.target.value })}
                          className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-blue-500"
                        />
                      </label>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <input type="checkbox" checked={selectedAnnotation.required ?? false} onChange={(event) => updateSelected({ required: event.target.checked })} className="size-4 accent-blue-600" />
                        Required
                      </label>
                      <label className="text-[11px] font-semibold text-slate-500">
                        Tab order
                        <input type="number" min="1" value={selectedAnnotation.tabIndex ?? 1} onChange={(event) => updateSelected({ tabIndex: Math.max(1, Number(event.target.value)) })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800" />
                      </label>
                    </div>
                    {selectedAnnotation.type === "input" && (
                      <>
                        <label className="block text-[11px] font-semibold text-slate-500">
                          Validation
                          <select value={selectedAnnotation.validation ?? "none"} onChange={(event) => updateSelected({ validation: event.target.value as Annotation["validation"] })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800">
                            <option value="none">Any text</option>
                            <option value="email">Email</option>
                            <option value="number">Number</option>
                            <option value="phone">Phone</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                          <input type="checkbox" checked={selectedAnnotation.multiline ?? false} onChange={(event) => updateSelected({ multiline: event.target.checked })} className="size-4 accent-blue-600" />
                          Multiple lines
                        </label>
                      </>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={duplicateSelectedAcrossPages} disabled={pageOrder.length < 2} className="w-full">
                      <Copy className="size-3.5" /> Duplicate on every page
                    </Button>
                  </div>
                )}
                {selectedAnnotation.type === "image-placeholder" && (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-600">
                      Placeholder label
                      <input
                        value={selectedAnnotation.label ?? ""}
                        onChange={(event) =>
                          updateSelected({ label: event.target.value })
                        }
                        className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal text-slate-800 outline-none focus:border-blue-500"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => chooseImage(selectedAnnotation.id)}
                      className="w-full"
                    >
                      <ImagePlus className="size-4" />
                      {selectedAnnotation.imageData
                        ? "Replace image"
                        : "Choose image"}
                    </Button>
                  </div>
                )}
                {selectedAnnotation.type !== "image" && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      {selectedAnnotation.type === "input"
                        ? "Text color"
                        : "Color"}
                    </p>
                    <div className="mt-3">
                      <ColorControl
                        value={selectedAnnotation.color}
                        onChange={(selectedColor) =>
                          updateSelected({ color: selectedColor })
                        }
                      />
                    </div>
                  </div>
                )}
                {(selectedAnnotation.type === "input" ||
                  selectedAnnotation.type === "cambodia-address") && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      Border color
                    </p>
                    <div className="mt-3">
                      <ColorControl
                        value={
                          selectedAnnotation.borderColor ?? "#64748b"
                        }
                        onChange={(borderColor) =>
                          updateSelected({ borderColor })
                        }
                      />
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={deleteSelected}
                  className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="size-4" /> Delete annotation
                </Button>
              </div>
            ) : (
              <div className="flex h-[calc(100%-3rem)] flex-col items-center justify-center px-7 text-center">
                <div className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <MousePointer2 className="size-5" />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-700">
                  Nothing selected
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Select an annotation on the page to change its style or
                  content.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
      <SignatureDialog
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
        onUse={(strokes) => {
          setPendingSignature(
            strokes.map((stroke) =>
              stroke.map((point) => ({ ...point })),
            ),
          );
          setSignatureOpen(false);
          setTool("signature");
        }}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <PdfExtractionDialog
        open={extractionOpen}
        onOpenChange={setExtractionOpen}
        result={extractionResult}
        isExtracting={isExtracting}
        progress={extractionProgress}
        error={extractionError}
        onExtract={() => void extractContent()}
      />
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Save reusable template</DialogTitle>
            <DialogDescription>
              Name this document, define its recipients, then assign fields from the Properties panel before sharing.
            </DialogDescription>
          </DialogHeader>
          {createdShareLinks.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <Check className="size-4" /> Template saved
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-700">
                  Copy each private link now. For security, the full token is shown only when a link is created or regenerated.
                </p>
              </div>
              <div className="space-y-2">
                {createdShareLinks.map((link) => (
                  <div key={link.roleId} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: link.roleColor }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{link.roleName}</p>
                      <p className="truncate text-xs text-slate-400">{link.url}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(link.url)}>
                      <Link2 className="size-3.5" /> Copy
                    </Button>
                  </div>
                ))}
              </div>
              <Button asChild type="button" className="w-full bg-blue-600 hover:bg-blue-700">
                <a href="/templates"><FolderOpen className="size-4" /> Open template library</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">
                  Template name
                  <input value={templateName} maxLength={120} onChange={(event) => setTemplateName(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500" />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Description
                  <input value={templateDescription} maxLength={500} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="Optional instructions" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500" />
                </label>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users className="size-4" /> Recipient roles</p>
                    <p className="mt-0.5 text-xs text-slate-400">Fields without an assignment use the first recipient.</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addRecipientRole} disabled={recipientRoles.length >= 10}>
                    <Plus className="size-3.5" /> Add recipient
                  </Button>
                </div>
                <div className="space-y-2">
                  {recipientRoles.map((role) => (
                    <div key={role.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <input type="color" aria-label={`${role.name} color`} value={role.color} onChange={(event) => updateRecipientRole(role.id, { color: event.target.value })} className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" />
                      <input value={role.name} maxLength={80} onChange={(event) => updateRecipientRole(role.id, { name: event.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500" />
                      <Button type="button" variant="ghost" size="icon-sm" disabled={recipientRoles.length <= 1} onClick={() => removeRecipientRole(role.id)} className="text-rose-600 hover:bg-rose-50"><Trash2 /></Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {createdShareLinks.length === 0 && (
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTemplateOpen(false)}>Cancel</Button>
              <Button type="button" disabled={!templateName.trim() || recipientRoles.some((role) => !role.name.trim()) || isSavingTemplate} onClick={() => void saveTemplate()} className="bg-blue-600 hover:bg-blue-700">
                {isSavingTemplate ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save and create links
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingReplacement !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReplacement(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-amber-100 text-amber-700">
              <TriangleAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Replace this PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current PDF and all unsaved editor changes will be removed
              from this browser session. Save a copy first if you need them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const file = pendingReplacement;
                setPendingReplacement(null);
                if (file) void openFile(file);
              }}
            >
              Replace PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function Brand(props: { compact?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2.5"
      aria-label="PDF Studio"
    >
      <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20">
        <FileText className="size-5" />
      </div>
      <span
        className={`font-semibold tracking-[-0.02em] text-slate-900 ${
          props.compact ? "hidden text-base lg:block" : "text-lg"
        }`}
      >
        PDF Studio
      </span>
    </div>
  );
}
