"use client";
import { useEffect, useRef, useState } from "react";

export function PdfPage(props: {
  url: string;
  page?: number;
  zoom?: number;
  fit?: "width" | "page";
  available?: { width: number; height: number };
  children?: (size: {
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  }) => React.ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [size, setSize] = useState({
      width: 600,
      height: 800,
      pageWidth: 600,
      pageHeight: 800,
    }),
    [loaded, setLoaded] = useState(""),
    [failure, setFailure] = useState({ key: "", message: "" });
  const resourceKey = `${props.url}:${props.page ?? 1}:${props.zoom ?? 100}:${props.fit}:${props.available?.width}:${props.available?.height}`;
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
      const width =
          props.fit && props.available
            ? Math.min(
                props.available.width,
                props.fit === "page"
                  ? (props.available.height * original.width) / original.height
                  : Infinity,
              )
            : (600 * (props.zoom ?? 100)) / 100,
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
        setSize({
          width: viewport.width,
          height: viewport.height,
          pageWidth: original.width,
          pageHeight: original.height,
        });
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
  }, [
    props.url,
    props.page,
    props.zoom,
    props.fit,
    props.available,
    resourceKey,
  ]);
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
