"use client";
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { FormDefinition, PdfMapping } from "./form";

export function PdfMapper(props: {
  id: string;
  definition: FormDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (mappings: PdfMapping[]) => void;
}) {
  const [fieldId, setFieldId] = useState(
      props.definition.fields.find((f) => f.type !== "section")?.id ?? "",
    ),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(100),
    [selected, setSelected] = useState<string | null>(null),
    [choice, setChoice] = useState("");
  const [drawing, setDrawing] = useState<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>(null),
    start = useRef<{ x: number; y: number } | null>(null);
  const currentField = props.definition.fields.find((f) => f.id === fieldId);
  const update = (id: string, patch: Partial<PdfMapping>) =>
    props.onChange(
      props.definition.mappings.map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    );
  const selectedMapping = props.definition.mappings.find(
    (m) => m.id === selected,
  );
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[94svh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-4 sm:max-w-[96vw] sm:p-6">
        <DialogHeader>
          <DialogTitle>Map answers to PDF</DialogTitle>
          <DialogDescription>
            Select a field, then draw its position. Reordering the web form
            keeps these placements.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto lg:grid-cols-[220px_minmax(0,1fr)_220px]">
          <aside className="space-y-3">
            <Label htmlFor="mapping-field">Form field</Label>
            <select
              id="mapping-field"
              className="h-10 w-full rounded-md border bg-background px-2"
              value={fieldId}
              onChange={(e) => {
                setFieldId(e.target.value);
                setChoice("");
                setSelected(null);
              }}
            >
              {props.definition.fields
                .filter((f) => f.type !== "section")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
            </select>
            {Boolean(currentField?.options.length) && (
              <>
                <Label htmlFor="mapping-choice">
                  Place answer or mark a choice
                </Label>
                <select
                  id="mapping-choice"
                  className="h-10 w-full rounded-md border bg-background px-2"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  <option value="">Answer text</option>
                  {currentField?.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      Checkbox: {o.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            <Button
              variant="outline"
              disabled={!currentField}
              onClick={() => {
                if (!currentField) return;
                const id = crypto.randomUUID();
                props.onChange([
                  ...props.definition.mappings,
                  {
                    id,
                    fieldId,
                    page,
                    x: 0.1,
                    y: 0.1,
                    width: choice ? 0.05 : 0.5,
                    height: choice ? 0.05 : 0.08,
                    fontSize: 12,
                    alignment: "left",
                    ...(choice ? { optionValue: choice } : {}),
                  },
                ]);
                setSelected(id);
              }}
            >
              Add placement
            </Button>
            <div className="max-h-48 space-y-1 overflow-auto lg:max-h-[50vh]">
              {props.definition.fields
                .filter((f) => f.type !== "section")
                .map((f) => {
                  const count = props.definition.mappings.filter(
                    (m) => m.fieldId === f.id,
                  ).length;
                  return (
                    <button
                      type="button"
                      key={f.id}
                      onClick={() => {
                        setFieldId(f.id);
                        setChoice("");
                      }}
                      className={`w-full rounded-md border p-3 text-left text-sm ${f.id === fieldId ? "border-primary bg-primary/5" : ""}`}
                    >
                      <span className="block truncate">{f.label}</span>
                      <span
                        className={`text-xs ${count ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}
                      >
                        {count
                          ? `${count} placement${count > 1 ? "s" : ""}`
                          : "Unmapped"}
                      </span>
                    </button>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground">
              Unmapped answers are still included in JSON. Map photos and
              signatures to an image box.
            </p>
          </aside>
          <div className="min-w-0 rounded-lg border bg-muted/30 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {props.definition.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= props.definition.pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
              <select
                aria-label="PDF zoom"
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[75, 100, 125, 150].map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[62svh] overflow-auto">
              <PdfPage
                url={`/api/forms/${props.id}/pdf`}
                page={page}
                zoom={zoom}
              >
                {(size) => (
                  <div
                    className="absolute inset-0"
                    style={{ touchAction: "none" }}
                    onPointerDown={(event) => {
                      if (
                        event.target !== event.currentTarget ||
                        !currentField ||
                        (selectedMapping &&
                          (event.target as Element).closest("[data-placement]"))
                      )
                        return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      start.current = {
                        x: Math.max(
                          0,
                          Math.min(
                            0.99,
                            (event.clientX - rect.left) / size.width,
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            0.99,
                            (event.clientY - rect.top) / size.height,
                          ),
                        ),
                      };
                      setDrawing({ ...start.current, width: 0, height: 0 });
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (!start.current) return;
                      const rect = event.currentTarget.getBoundingClientRect(),
                        x = Math.max(
                          0,
                          Math.min(1, (event.clientX - rect.left) / size.width),
                        ),
                        y = Math.max(
                          0,
                          Math.min(1, (event.clientY - rect.top) / size.height),
                        );
                      setDrawing({
                        x: Math.min(x, start.current.x),
                        y: Math.min(y, start.current.y),
                        width: Math.abs(x - start.current.x),
                        height: Math.abs(y - start.current.y),
                      });
                    }}
                    onPointerCancel={() => {
                      start.current = null;
                      setDrawing(null);
                    }}
                    onPointerUp={() => {
                      if (!start.current || !currentField) return;
                      const rectangle =
                        drawing &&
                        drawing.width > 0.01 &&
                        drawing.height > 0.005
                          ? drawing
                          : {
                              ...start.current,
                              width: Math.min(0.3, 1 - start.current.x),
                              height: Math.min(
                                currentField.type === "photo" ||
                                  currentField.type === "signature"
                                  ? 0.15
                                  : 0.04,
                                1 - start.current.y,
                              ),
                            };
                      const id = crypto.randomUUID();
                      props.onChange([
                        ...props.definition.mappings,
                        {
                          ...rectangle,
                          id,
                          fieldId,
                          page,
                          fontSize: 12,
                          alignment: "left",
                          ...(choice ? { optionValue: choice } : {}),
                        },
                      ]);
                      setSelected(id);
                      start.current = null;
                      setDrawing(null);
                    }}
                  >
                    {props.definition.mappings
                      .filter((m) => m.page === page)
                      .map((m) => (
                        <Rnd
                          key={m.id}
                          bounds="parent"
                          minWidth={8}
                          minHeight={8}
                          position={{
                            x: m.x * size.width,
                            y: m.y * size.height,
                          }}
                          size={{
                            width: m.width * size.width,
                            height: m.height * size.height,
                          }}
                          onDragStop={(_, data) =>
                            update(m.id, {
                              x: Math.max(0, data.x / size.width),
                              y: Math.max(0, data.y / size.height),
                            })
                          }
                          onResizeStop={(_, __, element, ___, position) =>
                            update(m.id, {
                              x: Math.max(0, position.x / size.width),
                              y: Math.max(0, position.y / size.height),
                              width: element.offsetWidth / size.width,
                              height: element.offsetHeight / size.height,
                            })
                          }
                          className={`border-2 ${selected === m.id ? "border-primary bg-primary/15" : "border-blue-400 bg-blue-100/30"}`}
                          onPointerDown={(e: React.PointerEvent) => {
                            e.stopPropagation();
                            setSelected(m.id);
                            setFieldId(m.fieldId);
                          }}
                          data-placement={m.id}
                        >
                          <span className="pointer-events-none block truncate px-1 text-xs text-blue-950">
                            {
                              props.definition.fields.find(
                                (f) => f.id === m.fieldId,
                              )?.label
                            }
                            {m.optionValue ? " ✓" : ""}
                          </span>
                        </Rnd>
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
          </div>
          <aside className="space-y-4">
            <h3 className="font-medium">Placement settings</h3>
            {selectedMapping ? (
              <>
                <Label htmlFor="mapping-size">Text size</Label>
                <Input
                  id="mapping-size"
                  type="number"
                  min={6}
                  max={48}
                  value={selectedMapping.fontSize}
                  onChange={(e) =>
                    update(selectedMapping.id, {
                      fontSize: Math.min(
                        48,
                        Math.max(6, Number(e.target.value)),
                      ),
                    })
                  }
                />
                <Label htmlFor="mapping-align">Alignment</Label>
                <select
                  id="mapping-align"
                  className="h-10 w-full rounded-md border bg-background px-2"
                  value={selectedMapping.alignment}
                  onChange={(e) =>
                    update(selectedMapping.id, {
                      alignment: e.target.value as PdfMapping["alignment"],
                    })
                  }
                >
                  {["left", "center", "right"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <div key={key}>
                      <Label htmlFor={`map-${key}`}>{key} (%)</Label>
                      <Input
                        id={`map-${key}`}
                        type="number"
                        step="0.1"
                        min={key === "width" || key === "height" ? 0.5 : 0}
                        max={100}
                        value={Math.round(selectedMapping[key] * 1000) / 10}
                        onChange={(e) => {
                          const value = Math.max(
                            key === "width" || key === "height" ? 0.005 : 0,
                            Math.min(1, Number(e.target.value) / 100),
                          );
                          const patch = { [key]: value };
                          if (key === "x")
                            patch.x = Math.min(
                              value,
                              1 - selectedMapping.width,
                            );
                          if (key === "y")
                            patch.y = Math.min(
                              value,
                              1 - selectedMapping.height,
                            );
                          if (key === "width")
                            patch.width = Math.min(
                              value,
                              1 - selectedMapping.x,
                            );
                          if (key === "height")
                            patch.height = Math.min(
                              value,
                              1 - selectedMapping.y,
                            );
                          update(selectedMapping.id, patch);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    props.onChange(
                      props.definition.mappings.filter(
                        (m) => m.id !== selectedMapping.id,
                      ),
                    );
                    setSelected(null);
                  }}
                >
                  Remove placement
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a box to move, resize, or edit its position numerically.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Long answers may need a larger box. Preview using realistic
              answers, including Khmer text.
            </p>
          </aside>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => props.onOpenChange(false)}>
            Done mapping
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function PdfPage(props: {
  url: string;
  page?: number;
  zoom?: number;
  children?: (size: { width: number; height: number }) => React.ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [size, setSize] = useState({ width: 600, height: 800 }),
    [loaded, setLoaded] = useState(""),
    [failure, setFailure] = useState({ key: "", message: "" });
  const resourceKey = `${props.url}:${props.page ?? 1}:${props.zoom ?? 100}`;
  const ready = loaded === resourceKey,
    error = failure.key === resourceKey ? failure.message : "";
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let task: { destroy(): Promise<void> } | null = null;
    async function render() {
      const response = await fetch(props.url, {
        signal: controller.signal,
        credentials: "same-origin",
      });
      if (!response.ok)
        throw Error("The PDF could not be loaded. Try reopening the preview.");
      const [pdfjs, worker] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const loading = pdfjs.getDocument({
        data: new Uint8Array(await response.arrayBuffer()),
      });
      task = loading;
      const document = await loading.promise;
      if (disposed) return;
      const page = await document.getPage(props.page ?? 1),
        original = page.getViewport({ scale: 1 });
      const width = (600 * (props.zoom ?? 100)) / 100,
        viewport = page.getViewport({ scale: width / original.width });
      if (!canvas.current || disposed) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.current.width = Math.ceil(viewport.width * ratio);
      canvas.current.height = Math.ceil(viewport.height * ratio);
      await page.render({
        canvas: canvas.current,
        viewport,
        transform: [ratio, 0, 0, ratio, 0, 0],
      }).promise;
      if (!disposed) {
        setSize({ width: viewport.width, height: viewport.height });
        setLoaded(resourceKey);
      }
    }
    void render().catch((e: unknown) => {
      if (!disposed)
        setFailure({
          key: resourceKey,
          message: e instanceof Error ? e.message : "PDF preview unavailable.",
        });
    });
    return () => {
      disposed = true;
      controller.abort();
      void task?.destroy();
    };
  }, [props.url, props.page, props.zoom, resourceKey]);
  return (
    <>
      <div role="status" className="text-sm text-muted-foreground">
        {error || (!ready ? "Loading PDF…" : "")}
      </div>
      <div
        className="relative mx-auto bg-white shadow-sm"
        style={{
          width: size.width,
          height: size.height,
          visibility: ready ? "visible" : "hidden",
        }}
      >
        <canvas
          ref={canvas}
          className="block"
          style={{ width: size.width, height: size.height }}
        />
        {ready && props.children?.(size)}
      </div>
    </>
  );
}
