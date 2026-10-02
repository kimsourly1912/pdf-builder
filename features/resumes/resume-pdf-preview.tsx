"use client";

import { AlertTriangle, Download, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ResumePdfPreview(props: {
  resumeId: string;
  fileName: string;
  contained?: boolean;
}) {
  const { resumeId, fileName } = props;
  const pagesRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const previewUrl = `/api/resumes/${resumeId}/download`;

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let loadingTask: { destroy: () => Promise<void> } | null = null;

    async function renderPreview() {
      const container = pagesRef.current;
      if (!container) return;
      container.replaceChildren();
      setStatus("loading");
      setError("");

      try {
        const response = await fetch(previewUrl, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await responseError(response));
        }
        const contentType = response.headers.get("Content-Type") ?? "";
        if (!contentType.toLocaleLowerCase().includes("application/pdf")) {
          throw new Error("The server did not return a PDF file.");
        }

        const [pdfjs, workerUrl] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
        const task = pdfjs.getDocument({
          data: new Uint8Array(await response.arrayBuffer()),
        });
        loadingTask = task;
        const document = await task.promise;
        if (disposed) return;

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          if (disposed) return;
          const page = await document.getPage(pageNumber);
          const displayViewport = page.getViewport({ scale: 1.5 });
          const renderViewport = page.getViewport({ scale: 1.5 * pixelRatio });
          const pageElement = window.document.createElement("figure");
          pageElement.className = "m-0 flex w-full flex-col items-center gap-2";

          const canvas = window.document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("This browser cannot render the PDF preview.");
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.style.width = `${displayViewport.width}px`;
          canvas.style.height = "auto";
          canvas.style.maxWidth = "100%";
          canvas.className = "block bg-white shadow-sm ring-1 ring-black/10";
          canvas.setAttribute("aria-label", `Page ${pageNumber} of ${document.numPages}`);

          const caption = window.document.createElement("figcaption");
          caption.className = "text-xs text-muted-foreground";
          caption.textContent = `Page ${pageNumber} of ${document.numPages}`;
          pageElement.insertAdjacentElement("beforeend", canvas);
          pageElement.insertAdjacentElement("beforeend", caption);
          container.insertAdjacentElement("beforeend", pageElement);

          await page.render({ canvas, canvasContext: context, viewport: renderViewport }).promise;
          page.cleanup();
        }
        if (!disposed) setStatus("ready");
      } catch (cause) {
        if (disposed || controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The PDF preview could not be loaded.",
        );
        setStatus("error");
      }
    }

    void renderPreview();
    return () => {
      disposed = true;
      controller.abort();
      void loadingTask?.destroy();
    };
  }, [attempt, previewUrl]);

  return (
    <div className={props.contained ? "flex h-full min-h-0 flex-col bg-muted/40" : "flex min-h-[32rem] flex-col bg-muted/40 xl:h-[calc(100vh-6rem)] xl:min-h-[650px]"}>
      <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium">{fileName}</p>
        </div>
        <Button asChild variant="outline" size="xs">
          <a href={previewUrl} download>
            <Download /> Download
          </a>
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
        {status === "loading" && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-muted/80 backdrop-blur-sm"
            role="status"
          >
            <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-sm">
              <LoaderCircle className="size-4 animate-spin" /> Rendering PDF preview…
            </div>
          </div>
        )}

        {status === "error" && (
          <Alert variant="destructive" className="mx-auto max-w-lg bg-card">
            <AlertTriangle />
            <AlertTitle>Preview unavailable</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  <RefreshCw /> Try again
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={previewUrl} download>
                    <Download /> Download PDF
                  </a>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div
          ref={pagesRef}
          className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5"
          aria-busy={status === "loading"}
          aria-label={`PDF preview for ${fileName}`}
        />
      </div>
    </div>
  );
}

async function responseError(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as { error?: string };
    return payload.error || "The PDF preview could not be loaded.";
  } catch {
    return "The PDF preview could not be loaded.";
  }
}
