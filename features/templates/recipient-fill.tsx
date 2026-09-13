"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CalendarDays,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import khmerFontUrl from "@expo-google-fonts/noto-sans-khmer/400Regular/NotoSansKhmer_400Regular.ttf?url";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CambodiaAddressField } from "@/features/gazetteer/cambodia-address-field";
import {
  formatCambodiaAddress,
  isAddressComplete,
  isGazetteerLevel,
  parseCambodiaAddress,
} from "@/features/gazetteer/gazetteer";
import type {
  TemplateAnnotation,
  TemplateFillPayload,
} from "@/features/templates/template.types";
import { isRecipientFieldType } from "@/features/templates/template-fields";
import { getScaledFieldIconSize } from "@/features/templates/field-layout";
import {
  DEFAULT_ELEMENT_BORDER_COLOR,
  DEFAULT_ELEMENT_FONT_SIZE,
} from "@/features/templates/field-style";
import {
  normalizedPointToPdf,
  normalizedRectToPdfBox,
} from "@/features/templates/pdf-coordinates";
import type {
  GazetteerLanguage,
  GazetteerLevel,
} from "@/features/gazetteer/gazetteer.types";

type PdfViewport = { width: number; height: number };
type PdfPage = {
  rotate: number;
  getViewport(options: { scale: number; rotation?: number }): PdfViewport;
  render(options: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void>; cancel: () => void };
};
type PdfDocument = {
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
};
type FieldOption = { id: string; label: string; checked: boolean };

const KHMER_FONT_FAMILY = "PDF Studio Khmer";
const KHMER_REGRESSION_SAMPLES = ["សួស្តីបង", "រាត្រីសួស្តី"] as const;
let khmerBrowserFontPromise: Promise<void> | null = null;

export function RecipientFill(props: { token: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const [payload, setPayload] = useState<TemplateFillPayload | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState<PdfViewport>({ width: 612, height: 792 });
  const [pageScale, setPageScale] = useState(1);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [metadataResponse, pdfResponse] = await Promise.all([
          fetch(`/api/fill/${props.token}`, { cache: "no-store" }),
          fetch(`/api/fill/${props.token}/pdf`, { cache: "no-store" }),
        ]);
        if (metadataResponse.status === 401) {
          window.location.assign(
            `/sign-in?return_to=${encodeURIComponent(`/fill/${props.token}`)}`,
          );
          return;
        }
        if (metadataResponse.status === 428) {
          window.location.assign("/change-password");
          return;
        }
        if (!metadataResponse.ok || !pdfResponse.ok) {
          const metadata = (await metadataResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(metadata.error || "This fill link is unavailable.");
        }
        const nextPayload = (await metadataResponse.json()) as TemplateFillPayload;
        const bytes = new Uint8Array(await pdfResponse.arrayBuffer()) as Uint8Array<ArrayBuffer>;
        const pdfjs = await import("pdfjs-dist");
        const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
        const document = (await pdfjs.getDocument({ data: bytes.slice() }).promise) as unknown as PdfDocument;
        if (!active) {
          await document.destroy();
          return;
        }
        setPayload(nextPayload);
        if (nextPayload.identity) {
          setRecipientName(nextPayload.identity.name);
          setRecipientEmail(nextPayload.identity.email);
        }
        setPdfBytes(bytes);
        setPdfDocument(document);
        setValues({
          ...initialValues(nextPayload.template.annotations),
          ...(nextPayload.initialValues ?? {}),
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "This document could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [props.token]);

  useEffect(() => {
    if (!pdfDocument || !payload || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;
    async function renderPage() {
      const entry = payload!.template.pageOrder[pageNumber - 1];
      if (!entry) return;
      const page = await pdfDocument!.getPage(entry.sourcePage);
      if (cancelled || !canvasRef.current) return;
      const rotation = (page.rotate + entry.rotation) % 360;
      const base = page.getViewport({ scale: 1, rotation });
      const availableWidth = Math.min(900, (viewportRef.current?.clientWidth ?? 700) - 24);
      const scale = Math.max(0.35, availableWidth / base.width);
      const viewport = page.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPageSize(viewport);
      setPageScale(scale);
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
    }
    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageNumber, payload, pdfDocument]);

  const updateValue = useCallback((id: string, value: unknown) => {
    setValues((current) => ({ ...current, [id]: value }));
    setError("");
  }, []);

  async function submit() {
    if (!payload || !pdfBytes) return;
    const invalid = payload.template.annotations.filter(
      (annotation) => isRecipientFieldType(annotation.type) && !fieldIsValid(annotation, values[annotation.id]),
    );
    if (!recipientName.trim()) {
      setError("Enter your name before submitting.");
      return;
    }
    if (recipientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipientEmail.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (invalid.length > 0) {
      setPageNumber(invalid[0].page);
      setError(`Complete ${invalid.length} required or invalid field${invalid.length === 1 ? "" : "s"}.`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const completedPdf = await buildCompletedPdf(
        pdfBytes,
        payload.template.pageOrder,
        payload.template.annotations,
        values,
      );
      const formData = new FormData();
      formData.set("recipientName", recipientName.trim());
      formData.set("recipientEmail", recipientEmail.trim());
      const submissionValues = { ...values };
      for (const annotation of payload.template.annotations) {
        if (annotation.type !== "image-placeholder") continue;
        const imageValue = values[annotation.id];
        delete submissionValues[annotation.id];
        if (typeof imageValue === "string" && imageValue.startsWith("data:image/")) {
          formData.set(
            `image:${annotation.id}`,
            dataUrlFile(imageValue, `${annotation.id}.jpg`),
          );
        }
      }
      formData.set("values", JSON.stringify(submissionValues));
      formData.set(
        "completedPdf",
        new File([completedPdf], `${payload.template.name}-completed.pdf`, { type: "application/pdf" }),
      );
      const response = await fetch(`/api/fill/${props.token}`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKeyRef.current },
        body: formData,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Submission could not be saved.");
      setCompleted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredState icon={<LoaderCircle className="animate-spin" />} title="Opening document…" description="Loading your recipient form." />;
  if (!payload || !pdfDocument || error && !pdfBytes) return <CenteredState icon={<LockKeyhole />} title="Document unavailable" description={error || "This fill link is invalid or expired."} />;
  if (completed) return <CenteredState icon={<FileCheck2 />} title="Submission completed" description="Your information and completed PDF were securely sent to the document owner." success />;

  const pageAnnotations = payload.template.annotations.filter((annotation) => annotation.page === pageNumber);
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{payload.template.name}</p>
            <p className="truncate text-xs text-muted-foreground">Complete as {payload.recipient.name}</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
            <LockKeyhole className="size-3.5" />
            <span className="hidden sm:inline">{payload.identity ? "Assigned to your account" : "Private recipient link"}</span>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 px-3 py-5 lg:grid-cols-[1fr_320px] lg:px-6">
        <section ref={viewportRef} className="min-w-0 overflow-auto rounded-xl border bg-muted/55 p-3 sm:p-6">
          <div className="mx-auto">
            <div className="relative mx-auto overflow-hidden bg-white shadow-2xl" style={{ width: pageSize.width, height: pageSize.height }}>
              <canvas ref={canvasRef} className="absolute inset-0 size-full" />
              {pageAnnotations.map((annotation) => <FillAnnotation key={annotation.id} annotation={annotation} value={values[annotation.id]} scale={pageScale} onChange={(value) => updateValue(annotation.id, value)} onError={setError} />)}
            </div>
            <div className="mt-4 flex items-center justify-center gap-3 text-xs font-medium text-muted-foreground">
              <Button type="button" variant="outline" size="icon-sm" disabled={pageNumber === 1} onClick={() => setPageNumber((page) => page - 1)}><ArrowLeft /></Button>
              Page {pageNumber} of {payload.template.pageOrder.length}
              <Button type="button" variant="outline" size="icon-sm" disabled={pageNumber === payload.template.pageOrder.length} onClick={() => setPageNumber((page) => page + 1)}><ArrowRight /></Button>
            </div>
          </div>
        </section>
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-sm">Finish submission</CardTitle>
            {payload.template.description && (
              <CardDescription className="text-xs leading-5">
                {payload.template.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="recipient-name">Your name</Label>
                <Input
                  id="recipient-name"
                  value={recipientName}
                  readOnly={Boolean(payload.identity)}
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipient-email">
                  Email {!payload.identity && <span className="font-normal text-muted-foreground">(optional)</span>}
                </Label>
                <Input
                  id="recipient-email"
                  type="email"
                  value={recipientEmail}
                  readOnly={Boolean(payload.identity)}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                />
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="button" onClick={() => void submit()} disabled={submitting} className="h-11 w-full">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
              Submit completed PDF
            </Button>
            <p className="text-center text-[11px] leading-4 text-muted-foreground">
              Your submission is sent only to the template owner.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function FillAnnotation(props: { annotation: TemplateAnnotation; value: unknown; scale: number; onChange: (value: unknown) => void; onError: (message: string) => void }) {
  const annotation = props.annotation;
  const style = { left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%`, width: `${annotation.width * 100}%`, height: `${annotation.height * 100}%` };
  const fontSize = getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE);
  const borderColor = getString(
    annotation.borderColor,
    DEFAULT_ELEMENT_BORDER_COLOR,
  );
  const required = Boolean(annotation.required);
  const placeholder = getString(annotation.placeholder, getString(annotation.label, "Enter value"));
  const options = getOptions(annotation.options);
  const fieldIconSize = getScaledFieldIconSize(props.scale);
  const mediaIconSize = getScaledFieldIconSize(props.scale, "media");

  if (annotation.type === "input" || annotation.type === "textarea" || annotation.type === "initials") return <div className="absolute" style={style}>{annotation.type === "textarea" || Boolean(annotation.multiline) ? <textarea value={String(props.value ?? "")} placeholder={placeholder} required={required} onChange={(event) => props.onChange(event.target.value)} className="size-full resize-none rounded border bg-white px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500" style={{ color: annotation.color, borderColor, fontSize }} /> : <input value={String(props.value ?? "")} placeholder={placeholder} required={required} onChange={(event) => props.onChange(event.target.value)} className="size-full rounded border bg-white px-2 outline-none focus:ring-2 focus:ring-blue-500" style={{ color: annotation.color, borderColor, fontSize }} />}</div>;
  if (annotation.type === "date") return <div className="absolute" style={style}><div className="relative size-full"><input type="date" value={String(props.value ?? "")} required={required} onChange={(event) => props.onChange(event.target.value)} className="pdf-native-date-field size-full rounded border bg-white px-2 outline-none focus:ring-2 focus:ring-blue-500" style={{ color: annotation.color, borderColor, fontSize, paddingRight: fieldIconSize + 12 }} /><CalendarDays aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" style={{ width: fieldIconSize, height: fieldIconSize }} strokeWidth={2.25} /></div></div>;
  if (annotation.type === "dropdown") return <div className="absolute" style={style}><div className="relative size-full"><select value={String(props.value ?? "")} required={required} onChange={(event) => props.onChange(event.target.value)} className="size-full appearance-none rounded border bg-white px-2 outline-none focus:ring-2 focus:ring-blue-500" style={{ color: annotation.color, borderColor, fontSize, paddingRight: fieldIconSize + 12 }}><option value="">{getString(annotation.label, "Select an option")}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" style={{ width: fieldIconSize, height: fieldIconSize }} strokeWidth={2.25} /></div></div>;
  if (annotation.type === "cambodia-address") return <div className="absolute" style={style}><CambodiaAddressField value={props.value} language={getGazetteerLanguage(annotation.gazetteerLanguage)} deepestLevel={getGazetteerLevel(annotation.gazetteerLevel)} required={required} label={getString(annotation.label, "Cambodia address")} onChange={props.onChange} style={{ color: annotation.color, borderColor, fontSize }} iconSize={fieldIconSize} /></div>;
  if (annotation.type === "checkbox" || annotation.type === "radio") return <button type="button" aria-label={getString(annotation.fieldName, annotation.type)} aria-pressed={Boolean(props.value)} onClick={() => props.onChange(!props.value)} className={`absolute flex items-center justify-center border-2 bg-white ${annotation.type === "radio" ? "rounded-full" : "rounded"}`} style={{ ...style, borderColor: annotation.color }}>{Boolean(props.value) && (annotation.type === "radio" ? <span className="size-1/2 rounded-full" style={{ backgroundColor: annotation.color }} /> : <Check className="size-full" style={{ color: annotation.color }} />)}</button>;
  if (annotation.type === "checkbox-group" || annotation.type === "radio-group") {
    const selected = Array.isArray(props.value) ? props.value.map(String) : [];
    return <fieldset className="absolute overflow-auto rounded-md bg-white/95 p-2" style={{ ...style, color: annotation.color, fontSize }}><legend className="font-bold">{getString(annotation.label, "Options")}</legend><div className="space-y-1.5">{options.map((option) => { const checked = selected.includes(option.id); return <label key={option.id} className="flex items-center gap-2"><input type={annotation.type === "radio-group" ? "radio" : "checkbox"} name={annotation.id} checked={checked} onChange={() => props.onChange(annotation.type === "radio-group" ? [option.id] : checked ? selected.filter((id) => id !== option.id) : [...selected, option.id])} className="shrink-0" style={{ width: fieldIconSize, height: fieldIconSize, accentColor: annotation.color }} />{option.label}</label>; })}</div></fieldset>;
  }
  if (annotation.type === "image-placeholder") return <label className="absolute flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-slate-50 text-center font-semibold" style={{ ...style, color: annotation.color, borderColor, fontSize }}>{typeof props.value === "string" && props.value.startsWith("data:image/") ? <Image src={props.value} alt="Uploaded" fill unoptimized className="object-cover" /> : <><UploadCloud style={{ width: mediaIconSize, height: mediaIconSize }} strokeWidth={2.1} />{getString(annotation.label, "Upload image")}</>}<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void prepareRecipientImage(file).then(props.onChange).catch(() => { props.onChange(""); props.onError("Choose a valid PNG or JPEG image up to 8 MB."); }); }} /></label>;
  if (annotation.type === "text") return <span className="pointer-events-none absolute whitespace-pre-wrap" style={{ ...style, color: annotation.color, fontSize: getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE) }}>{getString(annotation.text, "")}</span>;
  if (annotation.type === "highlight") return <span className="pointer-events-none absolute opacity-35" style={{ ...style, backgroundColor: annotation.color }} />;
  if (annotation.type === "rectangle" || annotation.type === "ellipse") return <span className={`pointer-events-none absolute border-2 ${annotation.type === "ellipse" ? "rounded-full" : ""}`} style={{ ...style, borderColor: annotation.color }} />;
  if (annotation.type === "line") {
    const up = annotation.lineDirection === "up";
    return <svg aria-hidden="true" className="pointer-events-none absolute overflow-visible" style={style} viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1={up ? "100" : "0"} x2="100" y2={up ? "0" : "100"} stroke={annotation.color} strokeWidth={getNumber(annotation.strokeWidth, 2)} vectorEffect="non-scaling-stroke" /></svg>;
  }
  if (annotation.type === "drawing") {
    const points = getPoints(annotation.points);
    return points.length > 1 ? <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={annotation.color} strokeWidth={getNumber(annotation.strokeWidth, 2.5) / 700} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg> : null;
  }
  if (annotation.type === "signature") {
    const strokes = getStrokes(annotation.strokes);
    return <svg aria-hidden="true" className="pointer-events-none absolute overflow-visible" style={style} viewBox="0 0 1 1" preserveAspectRatio="none">{strokes.map((stroke, index) => <polyline key={index} points={stroke.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={annotation.color} strokeWidth="0.012" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}</svg>;
  }
  if ((annotation.type === "image" || annotation.type === "image-placeholder") && typeof annotation.imageData === "string") return <span className="pointer-events-none absolute" style={style}><Image src={annotation.imageData} alt="" fill unoptimized className="object-fill" /></span>;
  return null;
}

function CenteredState(props: { icon: React.ReactNode; title: string; description: string; success?: boolean }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-muted/40 p-5">
      <Card className="w-full max-w-md text-center">
        <CardContent className="p-8">
          <span className={`mx-auto flex size-14 items-center justify-center rounded-xl ${props.success ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"} [&_svg]:size-6`}>
            {props.icon}
          </span>
          <h1 className="mt-5 text-xl font-semibold">{props.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{props.description}</p>
        </CardContent>
      </Card>
    </main>
  );
}

function initialValues(annotations: TemplateAnnotation[]) {
  return Object.fromEntries(annotations.filter((annotation) => isRecipientFieldType(annotation.type)).map((annotation) => {
    if (annotation.type === "checkbox" || annotation.type === "radio") return [annotation.id, Boolean(annotation.checked)];
    if (annotation.type === "checkbox-group" || annotation.type === "radio-group") return [annotation.id, getOptions(annotation.options).filter((option) => option.checked).map((option) => option.id)];
    if (annotation.type === "dropdown") return [annotation.id, getOptions(annotation.options).find((option) => option.checked)?.id ?? ""];
    if (annotation.type === "cambodia-address") return [annotation.id, parseCambodiaAddress(annotation.address)];
    if (annotation.type === "image-placeholder") return [annotation.id, ""];
    return [annotation.id, getString(annotation.text, "")];
  }));
}

function fieldIsValid(annotation: TemplateAnnotation, value: unknown) {
  if (annotation.type === "cambodia-address") {
    return !Boolean(annotation.required) || isAddressComplete(value, getGazetteerLevel(annotation.gazetteerLevel));
  }
  if (Boolean(annotation.required)) {
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "boolean" && !value) return false;
    if (typeof value !== "boolean" && !Array.isArray(value) && !String(value ?? "").trim()) return false;
  }
  const text = String(value ?? "").trim();
  const validation = getString(annotation.validation, "none");
  if (!text || validation === "none") return true;
  if (validation === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text);
  if (validation === "number") return Number.isFinite(Number(text));
  if (validation === "phone") return /^[+()\d\s.-]{6,}$/u.test(text);
  return true;
}

async function buildCompletedPdf(pdfBytes: Uint8Array<ArrayBuffer>, pageOrder: TemplateFillPayload["template"]["pageOrder"], annotations: TemplateAnnotation[], values: Record<string, unknown>) {
  const { PDFDocument, degrees, rgb } = await import("pdf-lib");
  const fontkitModule = await import("@pdf-lib/fontkit");
  const source = await PDFDocument.load(pdfBytes.slice());
  const output = await PDFDocument.create();
  output.registerFontkit(fontkitModule.default);
  const font = await output.embedFont(await fetch(khmerFontUrl).then((response) => response.arrayBuffer()), { subset: false });
  const copied = await output.copyPages(source, pageOrder.map((entry) => entry.sourcePage - 1));
  copied.forEach((page, index) => { page.setRotation(degrees((page.getRotation().angle + (pageOrder[index]?.rotation ?? 0)) % 360)); output.addPage(page); });
  const pages = output.getPages();
  async function drawText(options: { page: (typeof pages)[number]; text: string; x: number; topY: number; size: number; maxWidth: number; color: string }) {
    const { page, text, x, topY, size, maxWidth, color } = options;
    if (!containsKhmer(text)) {
      const parsedColor = hexToRgb(color);
      page.drawText(text, { x, y: topY - size, size, lineHeight: size * 1.35, font, color: rgb(parsedColor.r, parsedColor.g, parsedColor.b), maxWidth });
      return;
    }
    const rendered = await renderKhmerTextImage({ text, fontSize: size, color, maxWidth });
    const image = await output.embedPng(dataUrlBytes(rendered.dataUrl));
    page.drawImage(image, { x, y: topY - rendered.height, width: rendered.width, height: rendered.height });
  }
  for (const annotation of annotations) {
    const page = pages[annotation.page - 1];
    if (!page) continue;
    const cropBox = page.getCropBox();
    const rotation = page.getRotation().angle;
    const value = values[annotation.id];
    const color = hexToRgb(annotation.color);
    const box = normalizedRectToPdfBox(annotation, cropBox, rotation);
    const { x, y, width: boxWidth, height: boxHeight } = box;
    if (["input", "textarea", "date", "initials"].includes(annotation.type)) {
      const size = Math.max(
        6,
        getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE),
      );
      const topY = annotation.type === "textarea"
        ? y + boxHeight - 4
        : y + Math.max(size + 2, (boxHeight + size) / 2);
      await drawText({ page, text: String(value ?? ""), x: x + 4, topY, size, maxWidth: Math.max(4, boxWidth - 8), color: annotation.color });
    } else if (annotation.type === "dropdown") {
      const label = getOptions(annotation.options).find((option) => option.id === value)?.label ?? "";
      const size = Math.max(
        6,
        getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE),
      );
      await drawText({ page, text: label, x: x + 4, topY: y + Math.max(size + 2, (boxHeight + size) / 2), size, maxWidth: Math.max(4, boxWidth - 8), color: annotation.color });
    } else if (annotation.type === "cambodia-address") {
      const address = formatCambodiaAddress(value, getGazetteerLanguage(annotation.gazetteerLanguage));
      const size = Math.max(
        6,
        getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE),
      );
      await drawText({ page, text: address, x: x + 4, topY: y + boxHeight - 4, size, maxWidth: Math.max(4, boxWidth - 8), color: annotation.color });
    } else if ((annotation.type === "checkbox" || annotation.type === "radio") && value) {
      if (annotation.type === "radio") page.drawCircle({ x: x + boxWidth / 2, y: y + boxHeight / 2, size: Math.min(boxWidth, boxHeight) * 0.28, color: rgb(color.r, color.g, color.b) });
      else {
        page.drawLine({ start: { x: x + boxWidth * 0.18, y: y + boxHeight * 0.48 }, end: { x: x + boxWidth * 0.42, y: y + boxHeight * 0.22 }, thickness: 2, color: rgb(color.r, color.g, color.b) });
        page.drawLine({ start: { x: x + boxWidth * 0.42, y: y + boxHeight * 0.22 }, end: { x: x + boxWidth * 0.84, y: y + boxHeight * 0.78 }, thickness: 2, color: rgb(color.r, color.g, color.b) });
      }
    } else if ((annotation.type === "checkbox-group" || annotation.type === "radio-group") && Array.isArray(value)) {
      const labels = getOptions(annotation.options).filter((option) => value.includes(option.id)).map((option) => option.label).join(", ");
      const size = Math.max(
        6,
        getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE),
      );
      await drawText({ page, text: labels, x: x + 4, topY: y + Math.max(size + 2, boxHeight - 4), size, maxWidth: Math.max(4, boxWidth - 8), color: annotation.color });
    } else if (annotation.type === "image-placeholder" && typeof value === "string" && value.startsWith("data:image/")) {
      const bytes = dataUrlBytes(value);
      const image = value.startsWith("data:image/jpeg") ? await output.embedJpg(bytes) : await output.embedPng(bytes);
      page.drawImage(image, { x, y, width: boxWidth, height: boxHeight });
    } else if (annotation.type === "text") {
      const size = Math.max(
        6,
        getNumber(annotation.fontSize, DEFAULT_ELEMENT_FONT_SIZE),
      );
      await drawText({ page, text: getString(annotation.text, ""), x, topY: y + boxHeight, size, maxWidth: Math.max(4, boxWidth), color: annotation.color });
    } else if (annotation.type === "highlight") {
      page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, color: rgb(color.r, color.g, color.b), opacity: 0.35 });
    } else if (annotation.type === "rectangle") {
      page.drawRectangle({ x, y, width: boxWidth, height: boxHeight, borderColor: rgb(color.r, color.g, color.b), borderWidth: getNumber(annotation.strokeWidth, 2), opacity: 0 });
    } else if (annotation.type === "ellipse") {
      page.drawEllipse({ x: x + boxWidth / 2, y: y + boxHeight / 2, xScale: boxWidth / 2, yScale: boxHeight / 2, borderColor: rgb(color.r, color.g, color.b), borderWidth: getNumber(annotation.strokeWidth, 2) });
    } else if (annotation.type === "line") {
      const up = annotation.lineDirection === "up";
      page.drawLine({ start: { x, y: up ? y : y + boxHeight }, end: { x: x + boxWidth, y: up ? y + boxHeight : y }, thickness: getNumber(annotation.strokeWidth, 2), color: rgb(color.r, color.g, color.b) });
    } else if (annotation.type === "drawing") {
      const points = getPoints(annotation.points);
      for (let index = 1; index < points.length; index += 1) {
        page.drawLine({ start: normalizedPointToPdf(points[index - 1], cropBox, rotation), end: normalizedPointToPdf(points[index], cropBox, rotation), thickness: getNumber(annotation.strokeWidth, 2.5), color: rgb(color.r, color.g, color.b) });
      }
    } else if (annotation.type === "signature") {
      for (const stroke of getStrokes(annotation.strokes)) {
        for (let index = 1; index < stroke.length; index += 1) {
          page.drawLine({ start: normalizedPointToPdf({ x: annotation.x + stroke[index - 1].x * annotation.width, y: annotation.y + stroke[index - 1].y * annotation.height }, cropBox, rotation), end: normalizedPointToPdf({ x: annotation.x + stroke[index].x * annotation.width, y: annotation.y + stroke[index].y * annotation.height }, cropBox, rotation), thickness: 1.8, color: rgb(color.r, color.g, color.b) });
        }
      }
    } else if (annotation.type === "image" && typeof annotation.imageData === "string") {
      const bytes = dataUrlBytes(annotation.imageData);
      const image = annotation.imageData.startsWith("data:image/jpeg") ? await output.embedJpg(bytes) : await output.embedPng(bytes);
      page.drawImage(image, { x, y, width: boxWidth, height: boxHeight });
    }
  }
  return (await output.save()) as Uint8Array<ArrayBuffer>;
}

function getString(value: unknown, fallback: string) { return typeof value === "string" ? value : fallback; }
function getNumber(value: unknown, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function getGazetteerLevel(value: unknown): GazetteerLevel { return isGazetteerLevel(value) ? value : "village"; }
function getGazetteerLanguage(value: unknown): GazetteerLanguage { return value === "km" || value === "en" || value === "bilingual" ? value : "bilingual"; }
function getOptions(value: unknown): FieldOption[] { return Array.isArray(value) ? value.filter((option): option is FieldOption => Boolean(option) && typeof option === "object" && typeof (option as FieldOption).id === "string" && typeof (option as FieldOption).label === "string") : []; }
function getPoints(value: unknown): Array<{ x: number; y: number }> { return Array.isArray(value) ? value.filter((point): point is { x: number; y: number } => Boolean(point) && typeof point === "object" && typeof (point as { x?: unknown }).x === "number" && typeof (point as { y?: unknown }).y === "number") : []; }
function getStrokes(value: unknown): Array<Array<{ x: number; y: number }>> { return Array.isArray(value) ? value.map(getPoints).filter((stroke) => stroke.length > 1) : []; }
function hexToRgb(hex: string) { const value = hex.replace("#", ""); return { r: Number.parseInt(value.slice(0, 2), 16) / 255, g: Number.parseInt(value.slice(2, 4), 16) / 255, b: Number.parseInt(value.slice(4, 6), 16) / 255 }; }
function dataUrlBytes(dataUrl: string) { const binary = atob(dataUrl.split(",")[1] ?? ""); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }

function dataUrlFile(dataUrl: string, fileName: string) {
  const bytes = dataUrlBytes(dataUrl);
  const contentType = dataUrl.slice(5, dataUrl.indexOf(";"));
  return new File([bytes], fileName, { type: contentType });
}

async function prepareRecipientImage(file: File) {
  if (!/image\/(png|jpeg)/u.test(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error("Invalid image");
  }
  const bitmap = await createImageBitmap(file);
  const maxDimension = 2048;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Image processing is unavailable");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.9);
}

function containsKhmer(value: string) { return /[\u1780-\u17ff\u19e0-\u19ff]/u.test(value); }

function loadKhmerBrowserFont() {
  if (typeof FontFace === "undefined" || !window.document.fonts) return Promise.resolve();
  if (!khmerBrowserFontPromise) {
    const font = new FontFace(KHMER_FONT_FAMILY, `url(${khmerFontUrl})`, { style: "normal", weight: "400" });
    khmerBrowserFontPromise = font.load().then(async (loadedFont) => {
      window.document.fonts.add(loadedFont);
      await Promise.all(KHMER_REGRESSION_SAMPLES.map((sample) => window.document.fonts.load(`400 16px "${KHMER_FONT_FAMILY}"`, sample)));
    }).catch((error) => { khmerBrowserFontPromise = null; throw error; });
  }
  return khmerBrowserFontPromise;
}

async function renderKhmerTextImage(options: { text: string; fontSize: number; color: string; maxWidth: number }) {
  const text = options.text.normalize("NFC");
  const scale = 3;
  const padding = Math.max(2, options.fontSize * 0.28);
  const lineHeight = options.fontSize * 1.55;
  const lines = text.split("\n");
  const width = Math.max(1, options.maxWidth);
  const height = Math.max(1, padding * 2 + lineHeight * Math.max(1, lines.length));
  await loadKhmerBrowserFont();
  await window.document.fonts.load(`400 ${options.fontSize}px "${KHMER_FONT_FAMILY}"`, text);
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.scale(scale, scale);
  context.font = `400 ${options.fontSize}px "${KHMER_FONT_FAMILY}"`;
  context.fillStyle = options.color;
  context.direction = "ltr";
  context.fontKerning = "normal";
  context.textBaseline = "alphabetic";
  lines.forEach((line, index) => context.fillText(line, 2, padding + options.fontSize + lineHeight * index));
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}
