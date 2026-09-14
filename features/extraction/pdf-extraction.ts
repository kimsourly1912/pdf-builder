export type PdfTextRun = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  direction: string;
};

export type PdfExtractedAnnotation = {
  subtype: string;
  fieldName?: string;
  fieldType?: string;
  value?: unknown;
  contents?: string;
  alternativeText?: string;
  url?: string;
  rect?: number[];
};

export type PdfExtractedPage = {
  pageNumber: number;
  sourcePage: number;
  label: string;
  width: number;
  height: number;
  rotation: number;
  text: string;
  textRuns: PdfTextRun[];
  wordCount: number;
  characterCount: number;
  imageObjectCount: number;
  annotations: PdfExtractedAnnotation[];
};

export type PdfOutlineItem = {
  title: string;
  depth: number;
  url?: string;
};

export type PdfExtractedAttachment = {
  name: string;
  fileName: string;
  size: number;
  content: Uint8Array<ArrayBuffer>;
};

export type PdfExtractionResult = {
  fileName: string;
  extractedAt: string;
  metadata: Record<string, unknown>;
  pageCount: number;
  totalWords: number;
  totalCharacters: number;
  totalImageObjects: number;
  formFieldCount: number;
  annotationCount: number;
  scannedPageCount: number;
  outline: PdfOutlineItem[];
  pages: PdfExtractedPage[];
  attachments: PdfExtractedAttachment[];
  editorAnnotations: unknown[];
};

type TextContentItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
  dir?: string;
  hasEOL?: boolean;
};

type PdfPageLike = {
  getViewport(options: { scale: number; rotation?: number }): {
    width: number;
    height: number;
    rotation?: number;
  };
  getTextContent(options?: Record<string, unknown>): Promise<{
    items: Array<TextContentItem | Record<string, unknown>>;
  }>;
  getAnnotations(options?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  getOperatorList(): Promise<{ fnArray: number[] }>;
};

type PdfMetadata = {
  info?: Record<string, unknown>;
  metadata?: { getAll(): Record<string, unknown> } | null;
  contentDispositionFilename?: string | null;
  contentLength?: number | null;
};

export type PdfDocumentForExtraction = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  getMetadata(): Promise<PdfMetadata>;
  getOutline(): Promise<Array<Record<string, unknown>> | null>;
  getAttachments(): Promise<Record<string, { filename?: string; content?: Uint8Array }> | null>;
  getPageLabels(): Promise<Array<string> | null>;
};

type ExtractPdfContentOptions = {
  document: PdfDocumentForExtraction;
  fileName: string;
  pageOrder: Array<{ sourcePage: number; rotation: number }>;
  editorAnnotations: unknown[];
  onProgress?: (currentPage: number, totalPages: number) => void;
};

export async function extractPdfContent(options: ExtractPdfContentOptions) {
  const { document, fileName, pageOrder, editorAnnotations, onProgress } = options;
  const pdfjs = await import("pdfjs-dist");
  const imageOperationIds = new Set<number>(
    [
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintImageMaskXObject,
      pdfjs.OPS.paintSolidColorImageMask,
    ].filter((value): value is number => typeof value === "number"),
  );
  const [rawMetadata, rawOutline, rawAttachments, pageLabels] = await Promise.all([
    document.getMetadata().catch((): PdfMetadata => ({})),
    document.getOutline().catch(() => null),
    document.getAttachments().catch(() => null),
    document.getPageLabels().catch(() => null),
  ]);

  const pages: PdfExtractedPage[] = [];
  for (let index = 0; index < pageOrder.length; index += 1) {
    const entry = pageOrder[index];
    onProgress?.(index + 1, pageOrder.length);
    const page = await document.getPage(entry.sourcePage);
    const viewport = page.getViewport({ scale: 1, rotation: entry.rotation });
    const [textContent, rawAnnotations, operatorList] = await Promise.all([
      page.getTextContent({ disableNormalization: false }).catch(() => ({ items: [] })),
      page.getAnnotations({ intent: "display" }).catch(() => []),
      page.getOperatorList().catch(() => ({ fnArray: [] })),
    ]);
    const textItems = textContent.items.filter(isTextContentItem);
    const textRuns = textItems
      .filter((item) => Boolean(item.str))
      .map(toTextRun);
    const text = buildPageText(textItems);
    const annotations = rawAnnotations.map(toExtractedAnnotation);
    pages.push({
      pageNumber: index + 1,
      sourcePage: entry.sourcePage,
      label: pageLabels?.[entry.sourcePage - 1] ?? String(index + 1),
      width: round(viewport.width),
      height: round(viewport.height),
      rotation: entry.rotation,
      text,
      textRuns,
      wordCount: countWords(text),
      characterCount: text.length,
      imageObjectCount: operatorList.fnArray.filter((operation) => imageOperationIds.has(operation)).length,
      annotations,
    });
  }

  const attachments = Object.entries(rawAttachments ?? {}).map(([name, attachment]) => {
    const content = Uint8Array.from(attachment.content ?? []) as Uint8Array<ArrayBuffer>;
    return {
      name,
      fileName: attachment.filename || name,
      size: content.byteLength,
      content,
    };
  });
  const metadata = {
    ...toSerializableRecord(rawMetadata.info),
    ...toSerializableRecord(rawMetadata.metadata?.getAll()),
    contentDispositionFilename: rawMetadata.contentDispositionFilename ?? undefined,
    contentLength: rawMetadata.contentLength ?? undefined,
  };
  const annotationCount = pages.reduce((total, page) => total + page.annotations.length, 0);
  const formFieldCount = pages.reduce(
    (total, page) => total + page.annotations.filter((annotation) => Boolean(annotation.fieldName)).length,
    0,
  );

  return {
    fileName,
    extractedAt: new Date().toISOString(),
    metadata,
    pageCount: pages.length,
    totalWords: pages.reduce((total, page) => total + page.wordCount, 0),
    totalCharacters: pages.reduce((total, page) => total + page.characterCount, 0),
    totalImageObjects: pages.reduce((total, page) => total + page.imageObjectCount, 0),
    formFieldCount,
    annotationCount,
    scannedPageCount: pages.filter((page) => page.text.trim().length === 0).length,
    outline: flattenOutline(rawOutline),
    pages,
    attachments,
    editorAnnotations: structuredClone(editorAnnotations),
  } satisfies PdfExtractionResult;
}

export function createExtractionText(result: PdfExtractionResult) {
  const title = typeof result.metadata.Title === "string" ? result.metadata.Title : result.fileName;
  const sections = result.pages.map((page) => `--- Page ${page.label} ---\n${page.text || "[No selectable text found]"}`);
  return `${title}\n${"=".repeat(Math.min(80, Math.max(3, title.length)))}\n\n${sections.join("\n\n")}`;
}

export function createExtractionJson(result: PdfExtractionResult) {
  return JSON.stringify(
    {
      ...result,
      attachments: result.attachments.map((attachment) => ({
        name: attachment.name,
        fileName: attachment.fileName,
        size: attachment.size,
      })),
    },
    null,
    2,
  );
}

function isTextContentItem(value: TextContentItem | Record<string, unknown>): value is TextContentItem {
  return "str" in value;
}

function toTextRun(item: TextContentItem) {
  const transform = item.transform ?? [];
  return {
    text: item.str ?? "",
    x: round(transform[4] ?? 0),
    y: round(transform[5] ?? 0),
    width: round(item.width ?? 0),
    height: round(item.height ?? 0),
    fontName: item.fontName ?? "",
    direction: item.dir ?? "ltr",
  };
}

function buildPageText(items: TextContentItem[]) {
  let output = "";
  for (const item of items) {
    const text = item.str ?? "";
    if (!text) continue;
    const needsSpace = output.length > 0 && !output.endsWith("\n") && !/^\s/u.test(text);
    output += `${needsSpace ? " " : ""}${text}`;
    if (item.hasEOL) output += "\n";
  }
  return output.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function toExtractedAnnotation(annotation: Record<string, unknown>) {
  const extracted: PdfExtractedAnnotation = {
    subtype: getString(annotation.subtype) || getString(annotation.annotationType) || "Unknown",
  };
  if (getString(annotation.fieldName)) extracted.fieldName = getString(annotation.fieldName);
  if (getString(annotation.fieldType)) extracted.fieldType = getString(annotation.fieldType);
  if (annotation.fieldValue !== undefined) extracted.value = toSerializableValue(annotation.fieldValue);
  if (getString(annotation.contents)) extracted.contents = getString(annotation.contents);
  if (getString(annotation.alternativeText)) extracted.alternativeText = getString(annotation.alternativeText);
  if (getString(annotation.url)) extracted.url = getString(annotation.url);
  if (Array.isArray(annotation.rect)) extracted.rect = annotation.rect.filter((value): value is number => typeof value === "number");
  return extracted;
}

function flattenOutline(items: Array<Record<string, unknown>> | null, depth = 0): PdfOutlineItem[] {
  if (!items) return [];
  return items.flatMap((item) => {
    const current: PdfOutlineItem = { title: getString(item.title) || "Untitled bookmark", depth };
    if (getString(item.url)) current.url = getString(item.url);
    const children = Array.isArray(item.items) ? item.items.filter(isRecord) : [];
    return [current, ...flattenOutline(children, depth + 1)];
  });
}

function toSerializableRecord(value: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, entry]) => [key, toSerializableValue(entry)]));
}

function toSerializableValue(value: unknown): unknown {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toSerializableValue);
  if (isRecord(value)) return toSerializableRecord(value);
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function countWords(text: string) {
  if (!text.trim()) return 0;
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return Array.from(segmenter.segment(text)).filter((segment) => segment.isWordLike).length;
  }
  return text.trim().split(/\s+/u).length;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
