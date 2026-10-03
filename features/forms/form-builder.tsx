"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import { useSortable, isSortableOperation } from "@dnd-kit/react/sortable";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Upload,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CANDIDATE_PREFILL_OPTIONS } from "@/features/resumes/candidate-prefill-options";
import { useUnsavedChanges } from "@/features/resumes/use-unsaved-changes";
import { createFieldKey } from "@/features/templates/label-binding";
import {
  FIELD_LABELS,
  EMPTY_FORM,
  initialAnswers,
  definitionSchema,
} from "./form";
import { mappingProgress, sampleAnswer } from "./mapping-tools";
import type { FormDefinition, FormField } from "./form";
import { formApi } from "./client";
import { FormFieldControl, FormRenderer } from "./form-renderer";
const PdfMapper = lazy(() =>
  import("./pdf-mapper").then((module) => ({ default: module.PdfMapper })),
);
const PdfPage = lazy(() =>
  import("./pdf-page").then((module) => ({ default: module.PdfPage })),
);

type Document = {
  id: string;
  name: string;
  description: string;
  revision: string;
  definition: FormDefinition;
  fileName: string;
  publishedVersion: number | null;
};
type History = {
  past: FormDefinition[];
  present: FormDefinition;
  future: FormDefinition[];
};
export function FormBuilder(props: { id: string; displayName: string }) {
  const [document, setDocument] = useState<Document | null>(null),
    [history, setHistory] = useState<History>({
      past: [],
      present: EMPTY_FORM,
      future: [],
    }),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Loading…"),
    [step, setStep] = useState<"build" | "map" | "preview" | "publish">(
      "build",
    ),
    [fieldSearch, setFieldSearch] = useState(""),
    [insertAt, setInsertAt] = useState<number | null>(null),
    [previewInitial, setPreviewInitial] = useState<Record<string, unknown>>({}),
    [mobile, setMobile] = useState(false),
    [panel, setPanel] = useState<"elements" | "form" | "settings">("form"),
    [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sampleMedia, setSampleMedia] = useState(() => new Map<string, File>());
  const changeSampleMedia = useCallback((id: string, file: File | null) => {
    setSampleMedia((previous) => {
      const next = new Map(previous);
      if (file) next.set(id, file);
      else next.delete(id);
      return next;
    });
  }, []);
  const [pdfPage, setPdfPage] = useState(1);
  const [sampleFingerprint, setSampleFingerprint] = useState("");
  const [pdfFingerprint, setPdfFingerprint] = useState("");
  const [pdfMedia, setPdfMedia] = useState<Map<string, File> | null>(null);
  const samples = useRef<Record<string, unknown>>({}),
    revision = useRef(""),
    saved = useRef(""),
    saving = useRef<Promise<void> | null>(null),
    current = useRef<{ document: Document | null; definition: FormDefinition }>(
      { document: null, definition: EMPTY_FORM },
    );
  useEffect(() => {
    current.current = { document, definition: history.present };
  }, [document, history.present]);
  const fingerprint = document
    ? JSON.stringify([document.name, document.description, history.present])
    : "";
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const dirty = Boolean(document && fingerprint !== savedFingerprint);
  useUnsavedChanges(dirty);
  useEffect(() => {
    let active = true;
    void formApi<Document>(`/api/forms/${props.id}`)
      .then((data) => {
        if (!active) return;
        revision.current = data.revision;
        saved.current = JSON.stringify([
          data.name,
          data.description,
          data.definition,
        ]);
        setSavedFingerprint(saved.current);
        setDocument(data);
        setHistory({ past: [], present: data.definition, future: [] });
        setSaveState("Saved");
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.id]);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  const save = useCallback(async () => {
    while (true) {
      if (saving.current) {
        await saving.current;
        continue;
      }
      const snapshot = current.current;
      if (!snapshot.document) return;
      const signature = JSON.stringify([
        snapshot.document.name,
        snapshot.document.description,
        snapshot.definition,
      ]);
      if (signature === saved.current) return;
      setSaveState("Saving…");
      const operation = (async () => {
        try {
          const result = await formApi<{ revision: string }>(
            `/api/forms/${props.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                name: snapshot.document!.name,
                description: snapshot.document!.description,
                definition: snapshot.definition,
                revision: revision.current,
              }),
            },
          );
          revision.current = result.revision;
          saved.current = signature;
          setSavedFingerprint(signature);
          setSaveState("Saved");
          setError("");
        } catch (e) {
          setSaveState("Save failed — retry Save draft");
          setError(e instanceof Error ? e.message : "Save failed.");
          throw e;
        } finally {
          saving.current = null;
        }
      })();
      saving.current = operation;
      await operation;
    }
  }, [props.id]);
  useEffect(() => {
    if (!document || !dirty || busy) return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 1400);
    return () => clearTimeout(timer);
  }, [fingerprint, document, dirty, busy, save]);
  const edit = (definition: FormDefinition) => {
    setHistory((h) => ({
      past: [...h.past, h.present].slice(-50),
      present: definition,
      future: [],
    }));
    setMessage("");
  };
  const selectedField = history.present.fields.find((f) => f.id === selected);
  const patch = (field: FormField) =>
    edit({
      ...history.present,
      fields: history.present.fields.map((f) =>
        f.id === field.id ? field : f,
      ),
      mappings: history.present.mappings.filter(
        (m) =>
          m.fieldId !== field.id ||
          !m.optionValue ||
          field.options.some((o) => o.id === m.optionValue),
      ),
    });
  const newField = (
    type: FormField["type"],
    at = insertAt ?? history.present.fields.length,
  ) => {
    const base = createFieldKey(FIELD_LABELS[type]),
      keys = new Set(history.present.fields.map((f) => f.key));
    let key = base,
      number = 2;
    while (keys.has(key)) key = `${base}_${number++}`;
    const field: FormField = {
      id: crypto.randomUUID(),
      type,
      key,
      label: FIELD_LABELS[type],
      help: "",
      required: false,
      width: "full",
      editable: true,
      options: ["dropdown", "radio", "checkboxes"].includes(type)
        ? [
            { id: "option_1", label: "Option 1" },
            { id: "option_2", label: "Option 2" },
          ]
        : [],
    };
    const fields = [...history.present.fields];
    fields.splice(at, 0, field);
    edit({ ...history.present, fields });
    setSelected(field.id);
    setInsertAt(null);
    setPanel("form");
  };
  const reorder = (from: number, to: number) => {
    if (
      from < 0 ||
      to < 0 ||
      to >= history.present.fields.length ||
      from === to
    )
      return;
    const fields = [...history.present.fields],
      [field] = fields.splice(from, 1);
    fields.splice(to, 0, field);
    edit({ ...history.present, fields });
  };
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      await save();
      const snapshot = current.current;
      const result = await formApi<{ revision: string; versionNumber: number }>(
        `/api/forms/${props.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            name: snapshot.document?.name,
            description: snapshot.document?.description,
            definition: snapshot.definition,
            revision: revision.current,
          }),
        },
      );
      revision.current = result.revision;
      setDocument((d) =>
        d ? { ...d, publishedVersion: result.versionNumber } : d,
      );
      saved.current = JSON.stringify([
        snapshot.document?.name,
        snapshot.document?.description,
        snapshot.definition,
      ]);
      setSavedFingerprint(saved.current);
      setMessage(
        `Version ${result.versionNumber} published. You can now assign this form.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publication failed.");
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File) => {
    if (
      history.present.pageCount &&
      !window.confirm(
        "Replace the draft PDF and clear its placements? Published assignments keep their original PDF.",
      )
    )
      return;
    setBusy(true);
    try {
      await save();
      const data = new FormData();
      data.set("pdf", file);
      data.set("revision", revision.current);
      const result = await formApi<{
        revision: string;
        definition: FormDefinition;
        fileName: string;
      }>(`/api/forms/${props.id}/pdf`, { method: "PUT", body: data });
      revision.current = result.revision;
      setHistory({ past: [], present: result.definition, future: [] });
      setDocument((d) => (d ? { ...d, fileName: result.fileName } : d));
      saved.current = JSON.stringify([
        current.current.document?.name,
        current.current.document?.description,
        result.definition,
      ]);
      setSavedFingerprint(saved.current);
      setMessage(
        "PDF uploaded. Select a field, then use Place field to position its answer.",
      );
      setStep("map");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };
  const previewPdf = async (values = samples.current) => {
    const valueFingerprint = JSON.stringify(values);
    setBusy(true);
    try {
      const body = new FormData();
      setError("");
      setPdfUrl(null);
      body.set(
        "payload",
        JSON.stringify({
          definition: history.present,
          values,
        }),
      );
      for (const [id, file] of sampleMedia) body.set(`image:${id}`, file);
      const response = await fetch(`/api/forms/${props.id}/preview`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const data = await response.json();
        throw Error(
          data && typeof data === "object" && "error" in data
            ? String(data.error)
            : "PDF preview failed.",
        );
      }
      setPdfPage(1);
      setPdfUrl(URL.createObjectURL(await response.blob()));
      setPdfFingerprint(valueFingerprint);
      setPdfMedia(sampleMedia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF preview unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const sampleValues = useCallback((values: Record<string, unknown>) => {
    samples.current = values;
    setSampleFingerprint(JSON.stringify(values));
  }, []);
  const progress = mappingProgress(history.present);
  const validation = definitionSchema.safeParse(history.present);
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past.at(-1)!,
            future: [h.present, ...h.future],
          }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? {
            past: [...h.past, h.present],
            present: h.future[0],
            future: h.future.slice(1),
          }
        : h,
    );
  const openPreview = (values?: Record<string, unknown>) => {
    const initial =
      values ??
      Object.fromEntries(
        history.present.fields
          .filter((f) => f.type !== "section")
          .map((f) => [f.id, samples.current[f.id] ?? sampleAnswer(f)]),
      );
    setPreviewInitial(initial);
    samples.current = initial;
    setStep("preview");
    if (history.present.pageCount) void previewPdf(initial);
  };
  return (
    <AppShell displayName={props.displayName} fullWidth>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/forms" className="text-sm text-muted-foreground">
            ← Form templates
          </Link>
          <h1 className="mt-1 break-words text-2xl font-semibold">
            {document?.name ?? "Form builder"}
          </h1>
          <p role="status" className="mt-1 text-sm text-muted-foreground">
            {saveState.startsWith("Save failed")
              ? saveState
              : dirty && saveState !== "Saving…"
                ? "Unsaved changes"
                : saveState}{" "}
            · Draft
            {document?.publishedVersion
              ? ` · Published v${document.publishedVersion}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !document}
            onClick={() => void save().catch(() => {})}
          >
            Save draft
          </Button>
          <Button
            variant="outline"
            disabled={!document || busy}
            onClick={() => openPreview()}
          >
            <Eye />
            Preview
          </Button>
          <Button
            disabled={
              !document ||
              busy ||
              (step === "publish" &&
                (!validation.success ||
                  !progress.total ||
                  !document.name.trim()))
            }
            onClick={() =>
              step === "publish"
                ? void publish()
                : step === "map"
                  ? openPreview()
                  : setStep(step === "build" ? "map" : "publish")
            }
          >
            {step === "publish" ? "Publish" : "Next"}
          </Button>
        </div>
      </div>
      <nav
        aria-label="Form building steps"
        className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-2 md:grid-cols-4"
      >
        {(
          [
            ["build", "Build form"],
            ["map", "Map PDF (optional)"],
            ["preview", "Preview & test"],
            ["publish", "Publish & assign"],
          ] as const
        ).map(([value, label], i) => (
          <Button
            key={value}
            variant={step === value ? "secondary" : "ghost"}
            aria-current={step === value ? "step" : undefined}
            disabled={!document || busy}
            onClick={() =>
              value === "preview" ? openPreview() : setStep(value)
            }
          >
            {i + 1}. {label}
          </Button>
        ))}
      </nav>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="rounded-lg border bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200"
        >
          {message}{" "}
          {document?.publishedVersion && (
            <Link href={`/forms/${props.id}/responses`} className="underline">
              Assign and view responses
            </Link>
          )}
        </div>
      )}
      {document && step === "build" && (
        <>
          <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
            <div>
              <Label htmlFor="form-name">Template name</Label>
              <Input
                id="form-name"
                value={document.name}
                disabled={busy}
                maxLength={160}
                onChange={(e) =>
                  setDocument({ ...document, name: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="form-description">
                Instructions for the user
              </Label>
              <Input
                id="form-description"
                value={document.description}
                disabled={busy}
                maxLength={500}
                onChange={(e) =>
                  setDocument({ ...document, description: e.target.value })
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !history.past.length}
                onClick={() =>
                  setHistory((h) => ({
                    past: h.past.slice(0, -1),
                    present: h.past.at(-1)!,
                    future: [h.present, ...h.future],
                  }))
                }
              >
                <Undo2 />
                Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !history.future.length}
                onClick={() =>
                  setHistory((h) => ({
                    past: [...h.past, h.present],
                    present: h.future[0],
                    future: h.future.slice(1),
                  }))
                }
              >
                <Redo2 />
                Redo
              </Button>
              <span className="text-sm text-muted-foreground">
                {
                  history.present.fields.filter((f) => f.type !== "section")
                    .length
                }{" "}
                inputs
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Click a label to edit. Drag the handle to reorder.
            </p>
          </div>
          <div
            className="flex flex-wrap gap-2 xl:hidden"
            role="group"
            aria-label="Builder panels"
          >
            {(["elements", "form", "settings"] as const).map((value) => (
              <Button
                key={value}
                variant={panel === value ? "secondary" : "outline"}
                aria-pressed={panel === value}
                onClick={() => setPanel(value)}
              >
                {value === "elements"
                  ? "Elements"
                  : value === "form"
                    ? "Form"
                    : "Settings"}
              </Button>
            ))}
          </div>
          <DragDropProvider
            onDragEnd={(event) => {
              if (event.canceled || busy) return;
              const source = event.operation.source,
                target = event.operation.target;
              if (!source || !target) return;
              if (source.data.kind === "palette") {
                const at = history.present.fields.findIndex(
                  (f) => f.id === target.id,
                );
                newField(
                  source.data.fieldType as FormField["type"],
                  at < 0 ? history.present.fields.length : at,
                );
              } else if (
                isSortableOperation(event.operation) &&
                event.operation.source
              ) {
                reorder(
                  event.operation.source.initialIndex,
                  event.operation.source.index,
                );
              } else {
                const from = history.present.fields.findIndex(
                    (f) => f.id === source.id,
                  ),
                  to = history.present.fields.findIndex(
                    (f) => f.id === target.id,
                  );
                reorder(from, to < 0 ? history.present.fields.length - 1 : to);
              }
            }}
          >
            <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[190px_minmax(0,1fr)_280px]">
              <aside
                className={`${panel === "elements" ? "block" : "hidden"} rounded-lg border bg-card p-3 xl:block`}
              >
                <h2 className="mb-3 font-semibold">Elements</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Click to add or drag into the form.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  <Input
                    aria-label="Search field types"
                    placeholder="Search fields…"
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    className="col-span-full"
                  />
                  {insertAt !== null && (
                    <p className="col-span-full text-xs text-primary">
                      Adding at position {insertAt + 1}. Choose a field type.
                    </p>
                  )}
                  {(
                    [
                      [
                        "Basic inputs",
                        [
                          "short_text",
                          "paragraph",
                          "email",
                          "number",
                          "date",
                          "section",
                        ],
                      ],
                      [
                        "Choices",
                        ["dropdown", "radio", "checkboxes", "checkbox"],
                      ],
                      ["Attachments", ["photo", "signature"]],
                    ] as const
                  ).map(([label, types]) => (
                    <div key={label} className="col-span-full space-y-2">
                      <h3 className="text-xs font-medium text-muted-foreground">
                        {label}
                      </h3>
                      {types
                        .filter((type) =>
                          FIELD_LABELS[type]
                            .toLowerCase()
                            .includes(fieldSearch.toLowerCase()),
                        )
                        .map((type) => (
                          <Palette
                            key={type}
                            type={type}
                            disabled={busy}
                            onAdd={() => newField(type)}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              </aside>
              <div
                className={`${panel === "form" ? "block" : "hidden"} min-w-0 xl:block`}
              >
                <BuilderCanvas
                  definition={history.present}
                  selected={selected}
                  busy={busy}
                  onSelect={(id) => setSelected(id)}
                  onLabel={(field, label) => patch({ ...field, label })}
                  onInsert={(at) => {
                    setInsertAt(at);
                    setPanel("elements");
                  }}
                  onMove={reorder}
                  onCopy={(field) => {
                    const base = field.key.slice(0, 54);
                    let key = `${base}_copy`,
                      n = 2;
                    while (history.present.fields.some((f) => f.key === key))
                      key = `${base.slice(0, 50)}_copy_${n++}`;
                    const copy = {
                      ...field,
                      id: crypto.randomUUID(),
                      key: key.slice(0, 64),
                      label: `${field.label} (copy)`.slice(0, 160),
                    };
                    edit({
                      ...history.present,
                      fields: history.present.fields.flatMap((f) =>
                        f.id === field.id ? [f, copy] : [f],
                      ),
                    });
                    setSelected(copy.id);
                  }}
                  onRemove={(field) => {
                    if (
                      history.present.mappings.some(
                        (m) => m.fieldId === field.id,
                      ) &&
                      !window.confirm(
                        "Remove this field and its PDF placements?",
                      )
                    )
                      return;
                    edit({
                      ...history.present,
                      fields: history.present.fields.filter(
                        (f) => f.id !== field.id,
                      ),
                      mappings: history.present.mappings.filter(
                        (m) => m.fieldId !== field.id,
                      ),
                    });
                    setSelected(null);
                  }}
                />
              </div>
              <aside
                className={`${panel === "settings" ? "block" : "hidden"} rounded-lg border bg-card p-4 xl:block`}
              >
                <h2 className="mb-4 font-semibold">Field settings</h2>
                {selectedField ? (
                  <FieldSettings
                    field={selectedField}
                    disabled={busy}
                    onChange={patch}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a field to edit its label and options. Advanced
                    settings are available when needed.
                  </p>
                )}
              </aside>
            </div>
            <DragOverlay>
              {(source) => (
                <div className="rounded-lg border bg-card px-4 py-3 shadow-lg">
                  {source.data.kind === "palette"
                    ? FIELD_LABELS[source.data.fieldType as FormField["type"]]
                    : history.present.fields.find((f) => f.id === source.id)
                        ?.label}
                </div>
              )}
            </DragOverlay>
          </DragDropProvider>
        </>
      )}
      {document && step === "map" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
            <div>
              <h2 className="font-semibold">Place form answers on your PDF</h2>
              <p className="text-sm text-muted-foreground">
                Optional. Your form and JSON exports work without a PDF.
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {document.fileName || "No PDF attached"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${busy ? "pointer-events-none opacity-50" : ""}`}
              >
                <Upload className="size-4" />
                {document.fileName ? "Replace PDF" : "Upload PDF"}
                <input
                  className="sr-only"
                  type="file"
                  accept="application/pdf"
                  disabled={busy}
                  aria-label="Upload source PDF"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => openPreview()}
              >
                Skip to preview
              </Button>
            </div>
          </div>
          {history.present.pageCount > 0 ? (
            <Suspense fallback={<p>Loading PDF workspace…</p>}>
              <PdfMapper
                id={props.id}
                definition={history.present}
                busy={busy}
                onChange={edit}
                onUndo={undo}
                onRedo={redo}
                canUndo={Boolean(history.past.length)}
                canRedo={Boolean(history.future.length)}
                onTest={(values) => openPreview(values)}
                sampleMedia={sampleMedia}
                onSampleMedia={changeSampleMedia}
              />
            </Suspense>
          ) : (
            <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Upload the original PDF to place answers on blank spaces, dotted
              lines, table cells, and checkboxes.
            </div>
          )}
        </>
      )}
      {document && step === "preview" && (
        <section aria-label="Preview form" className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Preview & test</h2>
            <p className="text-sm text-muted-foreground">
              Try sample answers and validation. This does not create a
              response.
            </p>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant={mobile ? "outline" : "secondary"}
                onClick={() => setMobile(false)}
              >
                Desktop
              </Button>
              <Button
                variant={mobile ? "secondary" : "outline"}
                onClick={() => setMobile(true)}
              >
                Mobile
              </Button>
            </div>
            <Button
              variant="outline"
              disabled={!history.present.pageCount || busy}
              onClick={() => void previewPdf()}
            >
              Preview completed PDF
            </Button>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
            <div
              className={`mx-auto w-full rounded-xl border bg-card p-5 ${mobile ? "max-w-[360px]" : ""}`}
            >
              <h2 className="mb-2 text-xl font-semibold">{document?.name}</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                {document?.description}
              </p>
              {step === "preview" && (
                <FormRenderer
                  definition={history.present}
                  initial={previewInitial}
                  onValues={sampleValues}
                  onMedia={changeSampleMedia}
                  compact={mobile}
                  preview
                />
              )}
            </div>
            <div className="min-w-0 overflow-auto rounded-lg border bg-muted/20 p-3">
              {pdfUrl ? (
                <Suspense fallback={<p>Loading PDF…</p>}>
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <Button
                        variant="outline"
                        disabled={pdfPage <= 1}
                        onClick={() => setPdfPage((p) => p - 1)}
                      >
                        Previous page
                      </Button>
                      <span>
                        Page {pdfPage} / {history.present.pageCount}
                      </span>
                      <Button
                        variant="outline"
                        disabled={pdfPage >= history.present.pageCount}
                        onClick={() => setPdfPage((p) => p + 1)}
                      >
                        Next page
                      </Button>
                    </div>
                    {(pdfFingerprint !== sampleFingerprint ||
                      pdfMedia !== sampleMedia) && (
                      <p
                        role="status"
                        className="mb-3 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      >
                        Sample answers changed. Use Preview completed PDF to
                        refresh this document.
                      </p>
                    )}
                    <PdfPage url={pdfUrl} page={pdfPage} />
                  </div>
                </Suspense>
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  Fill in sample answers, then preview the completed PDF.
                </p>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {
              history.present.fields.filter(
                (f) =>
                  f.type !== "section" &&
                  !history.present.mappings.some((m) => m.fieldId === f.id),
              ).length
            }{" "}
            fields are not mapped to PDF. All answers are still saved as JSON.
          </p>
        </section>
      )}
      {document && step === "publish" && (
        <section
          className="mx-auto w-full max-w-3xl space-y-5 rounded-xl border bg-card p-6"
          aria-label="Publish review"
        >
          <h2 className="text-xl font-semibold">Review and publish</h2>
          <p className="text-sm text-muted-foreground">
            Publish a version, then assign the whole form to candidate accounts.
            Existing assignments keep their published version.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="font-medium">
              {progress.total} questions · {progress.mapped} mapped ·{" "}
              {progress.excluded} excluded from PDF
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              All answers are included in exports.{" "}
              {history.present.pageCount
                ? `${progress.unmapped} questions still need PDF mapping.`
                : "No PDF attached — answers will be collected as a web form."}
            </p>
          </div>
          {!progress.total && (
            <p role="alert" className="text-sm text-destructive">
              Add at least one question before publishing.
            </p>
          )}
          {!document.name.trim() && (
            <p role="alert" className="text-sm text-destructive">
              Give this form a name before publishing.
            </p>
          )}
          {!validation.success && (
            <p role="alert" className="text-sm text-destructive">
              {validation.error.issues[0]?.message} Return to editing to fix
              this before publishing.
            </p>
          )}
          {history.present.fields.some(
            (f) =>
              f.options.length > 0 &&
              history.present.mappings.some(
                (m) => m.fieldId === f.id && m.optionValue,
              ) &&
              !history.present.mappings.some(
                (m) => m.fieldId === f.id && !m.optionValue,
              ) &&
              f.options.some(
                (o) =>
                  !history.present.mappings.some(
                    (m) => m.fieldId === f.id && m.optionValue === o.id,
                  ),
              ),
          ) && (
            <p className="rounded border border-amber-400 p-3 text-sm">
              Some choices have no PDF checkbox location. Map each choice or use
              one answer-text placement.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                !validation.success ||
                !progress.total ||
                !document.name.trim()
              }
              onClick={() => void publish()}
            >
              Publish form
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setStep("build")}
            >
              Back to editing
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => openPreview()}
            >
              Test form
            </Button>
          </div>
          {document.publishedVersion && (
            <Link
              href={`/forms/${props.id}/responses`}
              className="inline-block text-sm font-medium text-primary underline"
            >
              Assign and view responses →
            </Link>
          )}
        </section>
      )}
    </AppShell>
  );
}
function Palette(props: {
  type: FormField["type"];
  disabled: boolean;
  onAdd: () => void;
}) {
  const { ref: dragRef } = useDraggable({
    id: `palette_${props.type}`,
    type: "field",
    data: { kind: "palette", fieldType: props.type },
    disabled: props.disabled,
  });
  return (
    <button
      type="button"
      ref={dragRef}
      disabled={props.disabled}
      onClick={props.onAdd}
      className="flex touch-none items-center gap-2 rounded-md border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
    >
      <Plus className="size-4 shrink-0" />
      {FIELD_LABELS[props.type]}
    </button>
  );
}
function BuilderCanvas(props: {
  definition: FormDefinition;
  selected: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onLabel: (field: FormField, label: string) => void;
  onInsert: (at: number) => void;
  onMove: (from: number, to: number) => void;
  onCopy: (field: FormField) => void;
  onRemove: (field: FormField) => void;
}) {
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: "form_canvas",
    accept: "field",
  });
  const form = useForm<Record<string, unknown>>({
    defaultValues: initialAnswers(props.definition),
  });
  return (
    <main
      ref={dropRef}
      className={`min-w-0 rounded-xl border bg-card p-4 sm:p-6 ${isDropTarget ? "ring-2 ring-primary" : ""}`}
    >
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
        Form layout
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {props.definition.fields.map((field, index) => (
          <SortableField
            key={field.id}
            field={field}
            index={index}
            total={props.definition.fields.length}
            selected={field.id === props.selected}
            busy={props.busy}
            onSelect={() => props.onSelect(field.id)}
            onLabel={(label) => props.onLabel(field, label)}
            onInsert={() => props.onInsert(index)}
            onMove={(to) => props.onMove(index, to)}
            onCopy={() => props.onCopy(field)}
            onRemove={() => props.onRemove(field)}
          >
            <FormFieldControl
              field={field}
              control={form.control}
              disabled
              hideLabel={field.id === props.selected}
            />
          </SortableField>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <Button
          variant="outline"
          disabled={props.busy}
          onClick={() => props.onInsert(props.definition.fields.length)}
        >
          <Plus />
          Add field
        </Button>
      </div>
      {!props.definition.fields.length && (
        <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Drag an element here, or click an element to add it.
        </div>
      )}
    </main>
  );
}
function SortableField(props: {
  field: FormField;
  index: number;
  total: number;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onLabel: (label: string) => void;
  onInsert: () => void;
  onMove: (to: number) => void;
  onCopy: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const {
    ref: sortableRef,
    handleRef,
    isDragging,
    isDropTarget,
  } = useSortable({
    id: props.field.id,
    index: props.index,
    type: "field",
    data: { kind: "field" },
    disabled: props.busy,
  });
  return (
    <div
      ref={sortableRef}
      data-builder-field={props.field.id}
      className={`relative min-w-0 rounded-lg border-2 p-3 transition-colors ${props.field.width === "half" && props.field.type !== "section" ? "" : "sm:col-span-2"} ${props.selected ? "border-primary bg-primary/5" : "border-transparent hover:border-border"} ${isDragging ? "opacity-40" : ""}`}
      onClick={(e) => {
        if ((e.target as Element).closest("button,input,textarea,select"))
          return;
        props.onSelect();
      }}
    >
      {isDropTarget && (
        <div className="pointer-events-none absolute -top-2 left-0 right-0 h-0.5 bg-primary" />
      )}
      <button
        type="button"
        disabled={props.busy}
        aria-label={`Insert field before ${props.field.label}`}
        className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-card px-2 text-xs text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2"
        onClick={(e) => {
          e.stopPropagation();
          props.onInsert();
        }}
      >
        +
      </button>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <button
          type="button"
          ref={handleRef}
          disabled={props.busy}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
          aria-label={`Drag ${props.field.label}`}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${props.field.label} up`}
            disabled={props.busy || props.index === 0}
            onClick={() => props.onMove(props.index - 1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move ${props.field.label} down`}
            disabled={props.busy || props.index === props.total - 1}
            onClick={() => props.onMove(props.index + 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Duplicate ${props.field.label}`}
            disabled={props.busy}
            onClick={props.onCopy}
          >
            <Copy />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${props.field.label}`}
            disabled={props.busy}
            onClick={props.onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      {props.selected && (
        <Input
          aria-label="Edit selected field label"
          value={props.field.label}
          disabled={props.busy}
          maxLength={160}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => props.onLabel(e.target.value)}
          className="mb-2 font-medium"
        />
      )}
      <div className="pointer-events-none">{props.children}</div>
    </div>
  );
}
function FieldSettings(props: {
  field: FormField;
  disabled: boolean;
  onChange: (field: FormField) => void;
}) {
  const { field } = props;
  const set = (patch: Partial<FormField>) =>
    props.onChange({ ...field, ...patch });
  return (
    <fieldset disabled={props.disabled} className="space-y-4">
      <div>
        <Label htmlFor="field-label">Label</Label>
        <Input
          id="field-label"
          value={field.label}
          maxLength={160}
          onChange={(e) => set({ label: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="field-help">Help text</Label>
        <Textarea
          id="field-help"
          value={field.help}
          maxLength={500}
          rows={2}
          onChange={(e) => set({ help: e.target.value })}
        />
      </div>
      {field.type !== "section" && (
        <>
          <details className="rounded border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Export settings
            </summary>
            <div className="mt-3">
              <Label htmlFor="field-key">Export key</Label>
              <Input
                id="field-key"
                value={field.key}
                onChange={(e) => set({ key: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Stable name in JSON exports. Changing the label keeps this key.
              </p>
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => set({ required: e.target.checked })}
            />
            Required
          </label>
          <div>
            <Label htmlFor="field-width">Layout</Label>
            <select
              id="field-width"
              className="h-10 w-full rounded-md border bg-background px-2"
              value={field.width}
              onChange={(e) =>
                set({ width: e.target.value as FormField["width"] })
              }
            >
              <option value="full">Full width</option>
              <option value="half">Half width on desktop</option>
            </select>
          </div>
          {field.options.length > 0 && (
            <div className="space-y-2">
              <Label>Choices</Label>
              {field.options.map((o, i) => (
                <div key={o.id} className="flex gap-1">
                  <Input
                    aria-label={`Choice ${i + 1}`}
                    value={o.label}
                    onChange={(e) =>
                      set({
                        options: field.options.map((option) =>
                          option.id === o.id
                            ? { ...option, label: e.target.value }
                            : option,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove choice ${i + 1}`}
                    disabled={field.options.length <= 1}
                    onClick={() =>
                      set({
                        options: field.options.filter(
                          (option) => option.id !== o.id,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set({
                    options: [
                      ...field.options,
                      {
                        id: crypto.randomUUID(),
                        label: `Option ${field.options.length + 1}`,
                      },
                    ],
                  })
                }
              >
                Add choice
              </Button>
            </div>
          )}
          {!["photo", "signature", "checkbox", "checkboxes"].includes(
            field.type,
          ) && (
            <details className="rounded border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Autofill
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="field-autofill">
                    Autofill from candidate data
                  </Label>
                  <select
                    id="field-autofill"
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                    value={field.autofill ?? ""}
                    onChange={(e) =>
                      set({
                        autofill: CANDIDATE_PREFILL_OPTIONS.find(
                          (o) => o.key === e.target.value,
                        )?.key,
                      })
                    }
                  >
                    <option value="">No autofill</option>
                    {CANDIDATE_PREFILL_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.editable}
                    onChange={(e) => set({ editable: e.target.checked })}
                  />
                  User can edit prefilled values
                </label>
              </div>
            </details>
          )}
          {["short_text", "paragraph", "email"].includes(field.type) && (
            <details className="rounded border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Validation
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="field-min-length">Min length</Label>
                  <Input
                    id="field-min-length"
                    type="number"
                    min={0}
                    max={10000}
                    value={field.minLength ?? ""}
                    onChange={(e) =>
                      set({
                        minLength: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="field-max-length">Max length</Label>
                  <Input
                    id="field-max-length"
                    type="number"
                    min={1}
                    max={10000}
                    value={field.maxLength ?? ""}
                    onChange={(e) =>
                      set({
                        maxLength: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </details>
          )}
          {field.type === "number" && (
            <details className="rounded border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Validation
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="field-min">Minimum</Label>
                  <Input
                    id="field-min"
                    type="number"
                    value={field.min ?? ""}
                    onChange={(e) =>
                      set({
                        min: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="field-max">Maximum</Label>
                  <Input
                    id="field-max"
                    type="number"
                    value={field.max ?? ""}
                    onChange={(e) =>
                      set({
                        max: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </fieldset>
  );
}
