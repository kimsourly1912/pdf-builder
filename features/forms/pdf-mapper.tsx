"use client";
import { SelectField, SelectFieldOption } from "@/components/patterns/select-field";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import Image from "next/image";
import { PdfPage } from "./pdf-page";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  MousePointer2,
  Hand,
  Plus,
  Undo2,
  Redo2,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormDefinition, PdfMapping } from "./form";
import {
  clampPlacement,
  mappingProgress,
  placementText,
  sampleAnswer,
  snapPlacement,
} from "./mapping-tools";

export function PdfMapper(props: {
  id: string;
  definition: FormDefinition;
  busy?: boolean;
  onChange: (definition: FormDefinition) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onTest: (values: Record<string, unknown>) => void;
  sampleMedia: Map<string, File>;
  onSampleMedia: (fieldId: string, file: File | null) => void;
}) {
  const [fieldId, setFieldId] = useState(
    props.definition.fields.find((f) => f.type !== "section")?.id ?? "",
  );
  const [page, setPage] = useState(1),
    [zoom, setZoom] = useState(100);
  const [mode, setMode] = useState<"select" | "place" | "pan">("select");
  const [selected, setSelected] = useState<string | null>(null),
    [choice, setChoice] = useState("");
  const [showSamples, setShowSamples] = useState(true),
    [snap, setSnap] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [drawing, setDrawing] = useState<Pick<
    PdfMapping,
    "x" | "y" | "width" | "height"
  > | null>(null);
  const [guides, setGuides] = useState<{ axis: "x" | "y"; value: number }[]>(
    [],
  );
  const [fit, setFit] = useState<"width" | "page" | null>("width");
  const [viewport, setViewport] = useState({ width: 600, height: 800 });
  const scroll = useRef<HTMLDivElement>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const fields = props.definition.fields.filter((f) => f.type !== "section");
  const field = fields.find((f) => f.id === fieldId);
  const mapping = props.definition.mappings.find((m) => m.id === selected);
  const progress = mappingProgress(props.definition);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setViewport({
        width: Math.max(180, element.clientWidth - 32),
        height: Math.max(180, element.clientHeight - 32),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const changeMappings = (mappings: PdfMapping[]) =>
    props.onChange({ ...props.definition, mappings });
  const update = (id: string, patch: Partial<PdfMapping>) =>
    changeMappings(
      props.definition.mappings.map((m) =>
        m.id === id ? clampPlacement(m, patch) : m,
      ),
    );
  const remove = () => {
    if (!mapping) return;
    changeMappings(
      props.definition.mappings.filter((m) => m.id !== mapping.id),
    );
    setSelected(null);
  };
  const activate = (id: string, option = "") => {
    setFieldId(id);
    setChoice(option);
    setSelected(null);
    setMode("select");
    const existing = props.definition.mappings.find(
      (m) => m.fieldId === id && (m.optionValue ?? "") === option,
    );
    if (existing) {
      setSelected(existing.id);
      setPage(existing.page);
    }
  };
  const exclude = () => {
    if (!field) return;
    props.onChange({
      ...props.definition,
      fields: props.definition.fields.map((f) =>
        f.id === field.id ? { ...f, excludeFromPdf: !f.excludeFromPdf } : f,
      ),
      mappings: props.definition.mappings.filter((m) => m.fieldId !== field.id),
    });
    setSelected(null);
    setMode("select");
  };
  const add = (rect: Pick<PdfMapping, "x" | "y" | "width" | "height">) => {
    if (!field || props.busy || props.definition.mappings.length >= 500) return;
    const m = clampPlacement(
      {
        id: crypto.randomUUID(),
        fieldId,
        page,
        ...rect,
        fontSize: 12,
        alignment: "left",
        textMode: field.type === "paragraph" ? "wrap" : "single",
        color: "#000000",
        ...(choice ? { optionValue: choice } : {}),
      },
      {},
    );
    props.onChange({
      ...props.definition,
      fields: props.definition.fields.map((f) =>
        f.id === fieldId ? { ...f, excludeFromPdf: false } : f,
      ),
      mappings: [...props.definition.mappings, m],
    });
    setSelected(m.id);
    setMode("select");
  };
  const nextUnmapped = () => {
    for (const f of fields.filter((f) => !f.excludeFromPdf)) {
      const placements = props.definition.mappings.filter(
        (m) => m.fieldId === f.id,
      );
      if (!placements.length) {
        activate(f.id);
        setMode("place");
        return;
      }
      if (f.options.length && !placements.some((m) => !m.optionValue)) {
        const option = f.options.find(
          (o) => !placements.some((m) => m.optionValue === o.id),
        );
        if (option) {
          activate(f.id, option.id);
          setMode("place");
          return;
        }
      }
    }
  };
  const alignment = (value: PdfMapping["alignment"]) =>
    mapping && update(mapping.id, { alignment: value });
  const alignButtons = mapping && (
    <div className="flex gap-2" role="group" aria-label="Answer alignment">
      {(
        [
          ["left", AlignLeft],
          ["center", AlignCenter],
          ["right", AlignRight],
        ] as const
      ).map(([value, Icon]) => (
        <Button
          key={value}
          size="icon-sm"
          variant={mapping.alignment === value ? "secondary" : "ghost"}
          aria-label={`Align ${value}`}
          aria-pressed={mapping.alignment === value}
          disabled={props.busy}
          onClick={() => alignment(value)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
  const sampleValue = field ? (values[field.id] ?? sampleAnswer(field)) : "";
  return (
    <section
      aria-label="PDF mapping workspace"
      className="space-y-3"
      onKeyDown={(e) => {
        if (
          props.busy ||
          (e.target as Element).closest(
            "input,textarea,select,[contenteditable=true]",
          )
        )
          return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            if (props.canRedo) props.onRedo();
          } else if (props.canUndo) props.onUndo();
        }
      }}
    >
      <div
        aria-label="PDF mapping guide"
        className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3"
      >
        <p>
          <strong>1. Choose a question</strong>
          <span className="mt-1 block text-muted-foreground">
            Choose the answer you want to print.
          </span>
        </p>
        <p>
          <strong>2. Place its answer</strong>
          <span className="mt-1 block text-muted-foreground">
            Use Place field, then click or draw on a blank space, dotted line,
            or table cell.
          </span>
        </p>
        <p>
          <strong>3. Check the result</strong>
          <span className="mt-1 block text-muted-foreground">
            Move or resize the box, then test the completed PDF. Your original
            PDF stays intact.
          </span>
        </p>
      </div>
      <div role="status" className="rounded-lg bg-muted/40 px-4 py-2 text-sm">
        {mode === "place"
          ? `Place ${field?.label || "the selected answer"} on page ${page}. Click for a box or drag to draw its size.`
          : mapping
            ? `Editing ${field?.label || "answer placement"}. Drag to move, or use its handles to resize.`
            : "Choose a question, then select Place field to put its answer on the PDF."}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="PDF tools"
        >
          {(
            [
              ["select", MousePointer2, "Select"],
              ["place", Plus, "Place field"],
              ["pan", Hand, "Pan"],
            ] as const
          ).map(([value, Icon, label]) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "secondary" : "ghost"}
              aria-pressed={mode === value}
              disabled={props.busy || (value === "place" && !field)}
              onClick={() => setMode(value)}
            >
              <Icon />
              {label}
            </Button>
          ))}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Undo mapping change"
            disabled={props.busy || !props.canUndo}
            onClick={props.onUndo}
          >
            <Undo2 />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Redo mapping change"
            disabled={props.busy || !props.canRedo}
            onClick={props.onRedo}
          >
            <Redo2 />
          </Button>
          <Button
            size="sm"
            variant={fit === "width" ? "secondary" : "ghost"}
            onClick={() => setFit("width")}
          >
            Fit width
          </Button>
          <Button
            size="sm"
            variant={fit === "page" ? "secondary" : "ghost"}
            onClick={() => setFit("page")}
          >
            Fit page
          </Button>
          <SelectField
            aria-label="PDF zoom"
            className="h-8 rounded border bg-background px-2 text-sm"
            value={fit ? "fit" : zoom}
            onValueChange={(value) => {
              if (value === "fit") return;
              setFit(null);
              setZoom(Number(value));
            }}
          >
            {fit && <SelectFieldOption value="fit">Fit {fit}</SelectFieldOption>}
            {[50, 75, 100, 125, 150, 200].map((z) => (
              <SelectFieldOption key={z} value={z}>
                {z}%
              </SelectFieldOption>
            ))}
          </SelectField>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={snap}
              onCheckedChange={(checked) => setSnap(checked === true)}
            />
            Snap guides
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={showSamples}
              onCheckedChange={(checked) => setShowSamples(checked === true)}
            />
            Show sample answers
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={props.busy}
            onClick={() =>
              props.onTest(
                Object.fromEntries(
                  fields.map((f) => [f.id, values[f.id] ?? sampleAnswer(f)]),
                ),
              )
            }
          >
            Test completed PDF
          </Button>
        </div>
      </div>
      <div className="rounded-lg border bg-card p-3 xl:hidden space-y-2">
        <Label htmlFor="mobile-mapping-field">Form field</Label>
        <SelectField
          id="mobile-mapping-field"
          disabled={props.busy}
          value={fieldId}
          onValueChange={(value) => activate(value)}
          className="h-10 w-full rounded border bg-background px-2 text-sm"
        >
          {fields.map((f) => (
            <SelectFieldOption key={f.id} value={f.id}>
              {f.label} —{" "}
              {f.excludeFromPdf
                ? "Excluded"
                : props.definition.mappings.some((m) => m.fieldId === f.id)
                  ? "Mapped"
                  : "Unmapped"}
            </SelectFieldOption>
          ))}
        </SelectField>
        {field && field.options.length > 0 && (
          <div className="mt-2 space-y-2">
            <Label htmlFor="mobile-mapping-choice">Answer or checkbox</Label>
            <SelectField
              id="mobile-mapping-choice"
              disabled={props.busy}
              value={choice}
              onValueChange={(value) => activate(field.id, value)}
              className="h-10 w-full rounded border bg-background px-2 text-sm"
              placeholder="Answer text"
            >
              <SelectFieldOption value="">Answer text</SelectFieldOption>
              {field.options.map((o) => (
                <SelectFieldOption key={o.id} value={o.id}>
                  Checkbox: {o.label}
                </SelectFieldOption>
              ))}
            </SelectField>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {progress.mapped} mapped · {progress.excluded} excluded ·{" "}
          {progress.unmapped} unmapped
        </p>
      </div>
      <div className="grid min-w-0 items-start gap-3 xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        <aside className="hidden rounded-lg border bg-card p-3 xl:block xl:max-h-[75svh] xl:overflow-auto">
          <h2 className="font-semibold">Form fields</h2>
          <p className="my-2 text-xs text-muted-foreground">
            {progress.mapped} of {progress.total - progress.excluded} mapped ·{" "}
            {progress.excluded} excluded
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {fields.map((f) => {
              const placements = props.definition.mappings.filter(
                (m) => m.fieldId === f.id,
              );
              const incomplete =
                placements.length &&
                f.options.length &&
                !placements.some((m) => !m.optionValue) &&
                f.options.some(
                  (o) => !placements.some((m) => m.optionValue === o.id),
                );
              return (
                <div key={f.id}>
                  <button
                    type="button"
                    draggable={!props.busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-form-field", f.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    disabled={props.busy}
                    onClick={() => activate(f.id)}
                    className={`w-full rounded-md border p-3 text-left text-sm ${fieldId === f.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                  >
                    <span className="block break-words font-medium">
                      {f.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {f.excludeFromPdf
                        ? "Excluded from PDF"
                        : placements.length
                          ? `${incomplete ? "Some choices unmapped · " : "Mapped · "}Page ${[...new Set(placements.map((m) => m.page))].join(", ")}`
                          : "Unmapped"}
                    </span>
                  </button>
                  {f.id === fieldId && f.options.length > 0 && (
                    <div className="ml-3 mt-1 space-y-1">
                      <button
                        className={`w-full rounded px-2 py-1 text-left text-xs ${!choice ? "bg-secondary" : ""}`}
                        onClick={() => activate(f.id)}
                      >
                        Answer text
                      </button>
                      {f.options.map((o) => (
                        <button
                          key={o.id}
                          className={`w-full rounded px-2 py-1 text-left text-xs ${choice === o.id ? "bg-secondary" : ""}`}
                          onClick={() => activate(f.id, o.id)}
                        >
                          ☐ {o.label} ·{" "}
                          {placements.some((m) => m.optionValue === o.id)
                            ? "Mapped"
                            : "Unmapped"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Click to select, or drag a field onto the PDF. Excluded answers
            remain in the form and exports.
          </p>
        </aside>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Previous PDF page"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <SelectField
                aria-label="PDF page"
                value={page}
                onValueChange={(value) => setPage(Number(value))}
                className="h-8 rounded border bg-background px-2"
              >
                {Array.from({ length: props.definition.pageCount }, (_, i) => (
                  <SelectFieldOption key={i} value={i + 1}>
                    Page {i + 1} of {props.definition.pageCount}
                  </SelectFieldOption>
                ))}
              </SelectField>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="Next PDF page"
                disabled={page >= props.definition.pageCount}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={props.busy || !fields.length}
              onClick={nextUnmapped}
            >
              Next unmapped field
            </Button>
          </div>
          <p role="status" className="rounded-md bg-primary/5 p-2 text-xs">
            {mode === "place"
              ? `Place ${field?.label ?? "a field"}${choice ? ` — ${field?.options.find((o) => o.id === choice)?.label}` : ""}: click or draw its area on the PDF.`
              : mode === "pan"
                ? "Drag the PDF to move around. Switch to Select to edit an answer."
                : "Select a placement to move or resize it. Use Place field to add an answer."}
          </p>
          <div
            ref={scroll}
            className="h-[65svh] min-h-80 overflow-auto overscroll-contain rounded-lg border bg-muted/40 p-4"
            style={{ touchAction: mode === "pan" ? "none" : "auto" }}
            onPointerDown={(e) => {
              if (mode !== "pan" || !scroll.current) return;
              pan.current = {
                x: e.clientX,
                y: e.clientY,
                left: scroll.current.scrollLeft,
                top: scroll.current.scrollTop,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!pan.current || !scroll.current) return;
              scroll.current.scrollLeft =
                pan.current.left + pan.current.x - e.clientX;
              scroll.current.scrollTop =
                pan.current.top + pan.current.y - e.clientY;
            }}
            onPointerUp={() => {
              pan.current = null;
            }}
            onPointerCancel={() => {
              pan.current = null;
            }}
          >
            <PdfPage
              url={`/api/forms/${props.id}/pdf`}
              page={page}
              zoom={zoom}
              fit={fit ?? undefined}
              available={viewport}
            >
              {(size) => (
                <div
                  className="absolute inset-0"
                  style={{
                    cursor:
                      mode === "place"
                        ? "crosshair"
                        : mode === "pan"
                          ? "grab"
                          : "default",
                    touchAction: mode === "place" ? "none" : "auto",
                  }}
                  onDragOver={(e) => {
                    if (
                      !props.busy &&
                      e.dataTransfer.types.includes("application/x-form-field")
                    )
                      e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData(
                      "application/x-form-field",
                    );
                    const f = fields.find((f) => f.id === id);
                    if (
                      !f ||
                      props.busy ||
                      props.definition.mappings.length >= 500
                    )
                      return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const m = clampPlacement(
                      {
                        id: crypto.randomUUID(),
                        fieldId: id,
                        page,
                        x: (e.clientX - rect.left) / size.width,
                        y: (e.clientY - rect.top) / size.height,
                        width: 0.3,
                        height:
                          f.type === "paragraph" ||
                          f.type === "photo" ||
                          f.type === "signature"
                            ? 0.15
                            : 0.05,
                        fontSize: 12,
                        alignment: "left",
                        textMode: f.type === "paragraph" ? "wrap" : "single",
                      },
                      {},
                    );
                    props.onChange({
                      ...props.definition,
                      fields: props.definition.fields.map((f) =>
                        f.id === id ? { ...f, excludeFromPdf: false } : f,
                      ),
                      mappings: [...props.definition.mappings, m],
                    });
                    setFieldId(id);
                    setChoice("");
                    setSelected(m.id);
                    setMode("select");
                  }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (mode === "select") {
                      setSelected(null);
                      return;
                    }
                    if (mode !== "place" || !field || props.busy) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    start.current = {
                      x: Math.max(
                        0,
                        Math.min(0.995, (e.clientX - rect.left) / size.width),
                      ),
                      y: Math.max(
                        0,
                        Math.min(0.995, (e.clientY - rect.top) / size.height),
                      ),
                    };
                    setDrawing({ ...start.current, width: 0, height: 0 });
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!start.current) return;
                    const rect = e.currentTarget.getBoundingClientRect(),
                      x = Math.max(
                        0,
                        Math.min(1, (e.clientX - rect.left) / size.width),
                      ),
                      y = Math.max(
                        0,
                        Math.min(1, (e.clientY - rect.top) / size.height),
                      );
                    setDrawing({
                      x: Math.min(x, start.current.x),
                      y: Math.min(y, start.current.y),
                      width: Math.abs(x - start.current.x),
                      height: Math.abs(y - start.current.y),
                    });
                  }}
                  onPointerUp={() => {
                    if (!start.current) return;
                    add(
                      drawing && drawing.width > 0.01 && drawing.height > 0.005
                        ? drawing
                        : {
                            ...start.current,
                            width: choice ? 0.025 : 0.3,
                            height: choice
                              ? 0.025
                              : field?.type === "paragraph" ||
                                  field?.type === "photo" ||
                                  field?.type === "signature"
                                ? 0.15
                                : 0.05,
                          },
                    );
                    start.current = null;
                    setDrawing(null);
                  }}
                  onPointerCancel={() => {
                    start.current = null;
                    setDrawing(null);
                  }}
                >
                  {props.definition.mappings
                    .filter((m) => m.page === page)
                    .map((m) => {
                      const f = fields.find((f) => f.id === m.fieldId);
                      if (!f) return null;
                      const text = showSamples
                        ? placementText(f, m, values[f.id] ?? sampleAnswer(f))
                        : f.label;
                      const textWidth = m.width * size.pageWidth - 8;
                      const fontSize = m.fontSize;
                      const estimate =
                        Array.from(text).length * fontSize * 0.55;
                      const mayOverflow =
                        showSamples &&
                        !["photo", "signature", "checkbox"].includes(f.type) &&
                        !m.optionValue &&
                        (m.textMode === "single"
                          ? estimate > textWidth
                          : Math.ceil(estimate / Math.max(1, textWidth)) *
                              fontSize *
                              (m.lineSpacing ?? 1.2) >
                            m.height * size.pageHeight - 8);
                      return (
                        <Rnd
                          key={m.id}
                          bounds="parent"
                          cancel=".placement-toolbar"
                          minWidth={8}
                          minHeight={8}
                          disableDragging={props.busy || mode !== "select"}
                          enableResizing={
                            !props.busy &&
                            mode === "select" &&
                            selected === m.id
                          }
                          position={{
                            x: m.x * size.width,
                            y: m.y * size.height,
                          }}
                          size={{
                            width: m.width * size.width,
                            height: m.height * size.height,
                          }}
                          onDrag={(_, data) => {
                            if (snap)
                              setGuides(
                                snapPlacement(
                                  clampPlacement(m, {
                                    x: data.x / size.width,
                                    y: data.y / size.height,
                                  }),
                                  props.definition.mappings,
                                  size,
                                ).guides,
                              );
                          }}
                          onDragStop={(_, data) => {
                            const moved = clampPlacement(m, {
                              x: data.x / size.width,
                              y: data.y / size.height,
                            });
                            update(
                              m.id,
                              snap
                                ? snapPlacement(
                                    moved,
                                    props.definition.mappings,
                                    size,
                                  ).mapping
                                : moved,
                            );
                            setGuides([]);
                          }}
                          onResizeStop={(_, __, element, ___, position) =>
                            update(m.id, {
                              x: position.x / size.width,
                              y: position.y / size.height,
                              width: element.offsetWidth / size.width,
                              height: element.offsetHeight / size.height,
                            })
                          }
                          data-placement={m.id}
                          className={`border ${mayOverflow ? "border-amber-500 " : ""}${selected === m.id ? "border-primary ring-1 ring-primary" : "border-blue-400/60"}`}
                          onPointerDown={(e: React.PointerEvent) => {
                            if (mode !== "select") return;
                            e.stopPropagation();
                            setSelected(m.id);
                            setFieldId(m.fieldId);
                            setChoice(m.optionValue ?? "");
                          }}
                          onDoubleClick={() =>
                            document
                              .getElementById("placement-text-size")
                              ?.focus()
                          }
                          style={{
                            pointerEvents:
                              mode !== "select" ? "none" : undefined,
                          }}
                        >
                          <div
                            role="button"
                            tabIndex={mode === "select" ? 0 : -1}
                            aria-label={`${f.label} PDF placement`}
                            className="h-full w-full overflow-hidden outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary"
                            onFocus={() => {
                              setSelected(m.id);
                              setFieldId(m.fieldId);
                              setChoice(m.optionValue ?? "");
                            }}
                            onKeyDown={(e) => {
                              if (props.busy) return;
                              if (
                                [
                                  "ArrowLeft",
                                  "ArrowRight",
                                  "ArrowUp",
                                  "ArrowDown",
                                ].includes(e.key)
                              ) {
                                e.preventDefault();
                                const step = e.shiftKey ? 10 : 1;
                                update(m.id, {
                                  x:
                                    m.x +
                                    (e.key === "ArrowLeft"
                                      ? -step
                                      : e.key === "ArrowRight"
                                        ? step
                                        : 0) /
                                      size.width,
                                  y:
                                    m.y +
                                    (e.key === "ArrowUp"
                                      ? -step
                                      : e.key === "ArrowDown"
                                        ? step
                                        : 0) /
                                      size.height,
                                });
                              }
                              if (e.key === "Delete" || e.key === "Backspace") {
                                e.preventDefault();
                                changeMappings(
                                  props.definition.mappings.filter(
                                    (p) => p.id !== m.id,
                                  ),
                                );
                                setSelected(null);
                              }
                              if (e.key === "Escape") {
                                setSelected(null);
                                setMode("select");
                              }
                            }}
                            style={{
                              background: m.background ?? "transparent",
                              color: showSamples
                                ? (m.color ?? "#000000")
                                : "#2563eb",
                              fontSize: `${(m.fontSize * size.width) / size.pageWidth}px`,
                              lineHeight: m.lineSpacing ?? 1.2,
                              textAlign: m.alignment,
                              padding: (4 * size.width) / size.pageWidth,
                              whiteSpace:
                                m.textMode === "single" ? "nowrap" : "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {f.type === "photo" || f.type === "signature" ? (
                              <MappingSampleImage
                                file={
                                  showSamples
                                    ? props.sampleMedia.get(f.id)
                                    : undefined
                                }
                                label={
                                  f.type === "photo"
                                    ? "Photo area"
                                    : "Signature area"
                                }
                                fit={m.imageFit ?? "contain"}
                              />
                            ) : (
                              text
                            )}
                          </div>
                          {mayOverflow && selected === m.id && (
                            <span className="pointer-events-none absolute -bottom-6 left-0 w-max rounded bg-amber-100 px-2 text-xs text-amber-900">
                              May not fit — test PDF
                            </span>
                          )}
                          {selected === m.id && mode === "select" && (
                            <div
                              style={{
                                left: Math.max(
                                  -m.x * size.width,
                                  Math.min(
                                    0,
                                    size.width - m.x * size.width - 280,
                                  ),
                                ),
                                top:
                                  m.y * size.height < 44
                                    ? m.height * size.height + 8
                                    : -44,
                              }}
                              className="placement-toolbar absolute z-20 flex w-max items-center gap-2 rounded-md border bg-card p-1 text-foreground shadow-md"
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <label className="flex items-center gap-2 text-xs">
                                Size
                                <Input
                                  aria-label="Quick text size"
                                  type="number"
                                  min={6}
                                  max={48}
                                  value={m.fontSize}
                                  disabled={props.busy}
                                  className="w-12 rounded border bg-background p-1"
                                  onChange={(e) =>
                                    update(m.id, {
                                      fontSize: Math.max(
                                        6,
                                        Math.min(48, Number(e.target.value)),
                                      ),
                                      minFontSize: Math.min(
                                        m.minFontSize ?? 6,
                                        Math.max(6, Number(e.target.value)),
                                      ),
                                    })
                                  }
                                />
                              </label>
                              {alignButtons}
                              <Button
                                size="icon-sm"
                                variant={m.background ? "secondary" : "ghost"}
                                aria-label="Toggle cover background"
                                disabled={props.busy}
                                onClick={() =>
                                  update(m.id, {
                                    background: m.background
                                      ? undefined
                                      : "#ffffff",
                                  })
                                }
                              >
                                <span className="text-xs">Fill</span>
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label="Remove selected placement"
                                disabled={props.busy}
                                onClick={remove}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          )}
                        </Rnd>
                      );
                    })}
                  {guides.map((g, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute bg-pink-500"
                      style={
                        g.axis === "x"
                          ? {
                              left: g.value * size.width,
                              top: 0,
                              width: 1,
                              height: size.height,
                            }
                          : {
                              top: g.value * size.height,
                              left: 0,
                              height: 1,
                              width: size.width,
                            }
                      }
                    />
                  ))}
                  {drawing && (
                    <div
                      className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                      style={{
                        left: drawing.x * size.width,
                        top: drawing.y * size.height,
                        width: drawing.width * size.width,
                        height: drawing.height * size.height,
                      }}
                    />
                  )}
                </div>
              )}
            </PdfPage>
          </div>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            aria-label="PDF page thumbnails"
          >
            {Array.from({ length: props.definition.pageCount }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i + 1)}
                aria-label={`Go to PDF page ${i + 1}`}
                aria-pressed={page === i + 1}
                className={`shrink-0 rounded border p-1 text-xs ${page === i + 1 ? "border-primary bg-primary/5" : ""}`}
              >
                {Math.abs(page - (i + 1)) <= 1 ? (
                  <div className="pointer-events-none h-20 w-14 overflow-hidden">
                    <PdfPage
                      url={`/api/forms/${props.id}/pdf`}
                      page={i + 1}
                      zoom={8}
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-14 items-center justify-center bg-card">
                    PDF
                  </div>
                )}
                <span>Page {i + 1}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Only answer placements are edited. Cover area hides the selected
            region in the completed PDF; check it does not hide important
            content.
          </p>
        </div>
        <aside className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 break-words font-semibold">
            {field?.label ?? "Placement"}
          </h2>
          <fieldset disabled={props.busy} className="space-y-4">
            {mapping ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Connected to {field?.label}
                  {mapping.optionValue
                    ? ` — ${field?.options.find((o) => o.id === mapping.optionValue)?.label}`
                    : ""}
                </p>
                {!mapping.optionValue &&
                  field?.type !== "photo" &&
                  field?.type !== "signature" &&
                  field?.type !== "checkbox" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="placement-mode">Answer layout</Label>
                        <SelectField
                          id="placement-mode"
                          className="h-9 w-full rounded border bg-background px-2"
                          value={mapping.textMode ?? "wrap"}
                          onValueChange={(value) =>
                            update(mapping.id, {
                              textMode: value as "single" | "wrap",
                            })
                          }
                        >
                          <SelectFieldOption value="single">Single line</SelectFieldOption>
                          <SelectFieldOption value="wrap">Wrap into multiple lines</SelectFieldOption>
                        </SelectField>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="placement-text-size">Text size</Label>
                        <Input
                          id="placement-text-size"
                          type="number"
                          min={6}
                          max={48}
                          value={mapping.fontSize}
                          onChange={(e) =>
                            update(mapping.id, {
                              fontSize: Math.max(
                                6,
                                Math.min(48, Number(e.target.value)),
                              ),
                              minFontSize: Math.min(
                                mapping.minFontSize ?? 6,
                                Math.max(6, Number(e.target.value)),
                              ),
                            })
                          }
                        />
                      </div>
                      {alignButtons}
                      <div className="space-y-2">
                        <Label htmlFor="placement-color">Text color</Label>
                        <Input
                          id="placement-color"
                          type="color"
                          value={mapping.color ?? "#000000"}
                          onChange={(e) =>
                            update(mapping.id, { color: e.target.value })
                          }
                        />
                      </div>
                      {showSamples && field && !field.options.length && (
                        <div className="space-y-2">
                          <Label htmlFor="placement-sample">
                            Sample answer
                          </Label>
                          <Textarea
                            id="placement-sample"
                            className="min-h-20 w-full rounded border bg-background p-2 text-sm"
                            value={String(sampleValue)}
                            onChange={(e) =>
                              setValues({
                                ...values,
                                [field.id]: e.target.value,
                              })
                            }
                          />
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                            Long answers may not fit. Test the completed PDF for
                            accurate font sizing and overflow checks.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                {(field?.type === "photo" || field?.type === "signature") && (
                  <div className="space-y-2">
                    <Label htmlFor="placement-image-fit">Image fit</Label>
                    <SelectField
                      id="placement-image-fit"
                      value={mapping.imageFit ?? "contain"}
                      onValueChange={(value) =>
                        update(mapping.id, {
                          imageFit: value as "contain" | "stretch",
                        })
                      }
                      className="h-9 w-full rounded border bg-background px-2"
                    >
                      <SelectFieldOption value="contain">Keep proportions</SelectFieldOption>
                      <SelectFieldOption value="stretch">Fill box (stretch)</SelectFieldOption>
                    </SelectField>
                    <Label htmlFor="mapping-sample-image" className="mt-3">
                      Sample image
                    </Label>
                    <Input
                      id="mapping-sample-image"
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) => {
                        props.onSampleMedia(
                          field.id,
                          e.target.files?.[0] ?? null,
                        );
                        e.target.value = "";
                      }}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Upload a sample photo/signature here, or draw a signature
                      in Preview &amp; test. Samples are not submitted or
                      published.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Background</Label>
                  <label className="flex gap-2 text-sm">
                    <Checkbox
                      checked={Boolean(mapping.background)}
                      onCheckedChange={(checked) =>
                        update(mapping.id, {
                          background: (checked === true) ? "#ffffff" : undefined,
                        })
                      }
                    />
                    Cover area
                  </label>
                  {mapping.background && (
                    <Input
                      aria-label="Background fill color"
                      type="color"
                      value={mapping.background}
                      onChange={(e) =>
                        update(mapping.id, { background: e.target.value })
                      }
                    />
                  )}
                </div>
                <details className="rounded border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Advanced
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "width", "height"] as const).map((key) => (
                        <div key={key} className="space-y-2">
                          <Label htmlFor={`map-${key}`}>{key} (%)</Label>
                          <Input
                            id={`map-${key}`}
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            value={Math.round(mapping[key] * 1000) / 10}
                            onChange={(e) =>
                              update(mapping.id, {
                                [key]: Number(e.target.value) / 100,
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="placement-min-size">
                        Minimum text size
                      </Label>
                      <Input
                        id="placement-min-size"
                        type="number"
                        min={6}
                        max={mapping.fontSize}
                        value={mapping.minFontSize ?? 6}
                        onChange={(e) =>
                          update(mapping.id, {
                            minFontSize: Math.max(
                              6,
                              Math.min(
                                mapping.fontSize,
                                Number(e.target.value),
                              ),
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="placement-line-spacing">
                        Line spacing
                      </Label>
                      <Input
                        id="placement-line-spacing"
                        type="number"
                        min={1}
                        max={3}
                        step="0.1"
                        value={mapping.lineSpacing ?? 1.2}
                        onChange={(e) =>
                          update(mapping.id, {
                            lineSpacing: Math.max(
                              1,
                              Math.min(3, Number(e.target.value)),
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                </details>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSelected(null);
                    setMode("place");
                  }}
                >
                  Place again
                </Button>
                <Button variant="ghost" className="w-full" onClick={remove}>
                  Remove placement
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {field?.excludeFromPdf
                  ? "This answer is excluded from PDF output. It remains in the form and exports."
                  : "Select an answer box to adjust it, or use Place field to add one."}
              </p>
            )}
            {field && !mapping && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  add({
                    x: 0.25,
                    y: 0.25,
                    width: choice ? 0.025 : 0.3,
                    height: choice
                      ? 0.025
                      : field.type === "paragraph" ||
                          field.type === "photo" ||
                          field.type === "signature"
                        ? 0.15
                        : 0.05,
                  })
                }
              >
                Place in page center
              </Button>
            )}
            {field && (
              <Button variant="outline" className="w-full" onClick={exclude}>
                {field.excludeFromPdf
                  ? "Include in PDF mapping"
                  : "Exclude field from PDF"}
              </Button>
            )}
          </fieldset>
        </aside>
      </div>
    </section>
  );
}

function MappingSampleImage(props: {
  file?: File;
  label: string;
  fit: "contain" | "stretch";
}) {
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!props.file) return;
    const file = props.file,
      url = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setImage({ file, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [props.file]);
  return (
    <div className="relative flex h-full items-center justify-center border border-dashed border-blue-300 bg-blue-50 text-xs text-blue-700">
      {props.file && image?.file === props.file ? (
        <Image
          src={image.url}
          alt={`Sample ${props.label.toLowerCase()}`}
          fill
          unoptimized
          sizes="300px"
          style={{ objectFit: props.fit === "stretch" ? "fill" : "contain" }}
        />
      ) : (
        props.label
      )}
    </div>
  );
}
