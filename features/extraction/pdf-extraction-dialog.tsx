"use client";

import {
  Braces,
  Check,
  Clipboard,
  Download,
  FileText,
  ImageIcon,
  Info,
  Paperclip,
  RefreshCw,
  Search,
  TextSelect,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  createExtractionJson,
  createExtractionText,
} from "@/features/extraction/pdf-extraction";
import type {
  PdfExtractedAttachment,
  PdfExtractionResult,
} from "@/features/extraction/pdf-extraction";

type PdfExtractionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: PdfExtractionResult | null;
  isExtracting: boolean;
  progress: { current: number; total: number };
  error: string;
  onExtract: () => void;
};

export function PdfExtractionDialog(props: PdfExtractionDialogProps) {
  const {
    open,
    onOpenChange,
    result,
    isExtracting,
    progress,
    error,
    onExtract,
  } = props;
  const [selectedPage, setSelectedPage] = useState(1);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const safeSelectedPage = result && selectedPage <= result.pageCount ? selectedPage : 1;
  const page = result?.pages[safeSelectedPage - 1];
  const matchingPages = useMemo(() => {
    if (!result || !query.trim()) return new Set<number>();
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return new Set(
      result.pages
        .filter((entry) => entry.text.toLocaleLowerCase().includes(normalizedQuery))
        .map((entry) => entry.pageNumber),
    );
  }, [query, result]);

  async function copyText() {
    if (!result) return;
    await navigator.clipboard.writeText(createExtractionText(result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function downloadText() {
    if (!result) return;
    downloadBlob(
      new Blob([createExtractionText(result)], { type: "text/plain;charset=utf-8" }),
      `${baseName(result.fileName)}-content.txt`,
    );
  }

  function downloadJson() {
    if (!result) return;
    downloadBlob(
      new Blob([createExtractionJson(result)], { type: "application/json;charset=utf-8" }),
      `${baseName(result.fileName)}-content.json`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <TextSelect className="size-5 text-primary" /> Extract PDF content
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Review or export the text, structure, fields, notes, and attachments found in this PDF.
              </DialogDescription>
            </div>
            {result && !isExtracting && (
              <Button type="button" variant="outline" size="sm" onClick={onExtract}>
                <RefreshCw className="size-4" /> Re-extract
              </Button>
            )}
          </div>
        </DialogHeader>

        {isExtracting ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Spinner className="size-6" />
            </span>
            <p className="mt-4 text-base font-semibold text-foreground">Reading every page</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Page {progress.current || 1} of {progress.total || 1}
            </p>
            <Progress
              className="mt-4 w-56"
              value={Math.max(4, progress.total ? (progress.current / progress.total) * 100 : 4)}
            />
          </div>
        ) : error ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Info className="size-6" />
            </span>
            <p className="mt-4 font-semibold text-foreground">Content could not be extracted</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{error}</p>
            <Button type="button" className="mt-5" onClick={onExtract}>Try again</Button>
          </div>
        ) : result ? (
          <Tabs defaultValue="pages" className="min-h-0 flex-1 gap-0 overflow-hidden">
            <div className="border-b border-border px-4 sm:px-6">
              <TabsList variant="line" className="h-11 max-w-full justify-start overflow-x-auto">
                <TabsTrigger value="pages">Pages</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="fields">Fields & notes</TabsTrigger>
                <TabsTrigger value="attachments">Attachments {result.attachments.length > 0 && <Badge variant="secondary">{result.attachments.length}</Badge>}</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="pages" className="min-h-0 overflow-hidden p-0">
              <div className="grid h-[min(62dvh,620px)] min-h-0 md:grid-cols-[220px_1fr]">
                <aside className="flex min-h-0 flex-col border-b border-border bg-muted/50 md:border-b-0 md:border-r">
                  <label className="relative m-3 block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search extracted text"
                      className="h-10 pl-9"
                    />
                  </label>
                  <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
                    <div className="grid grid-cols-4 gap-2 md:grid-cols-1">
                      {result.pages.map((entry) => (
                        <Button
                          key={entry.pageNumber}
                          type="button"
                          variant="ghost"
                          aria-current={safeSelectedPage === entry.pageNumber ? "page" : undefined}
                          onClick={() => setSelectedPage(entry.pageNumber)}
                          className={cn(
                            "h-auto min-w-0 justify-between border px-3 py-2 text-left",
                            safeSelectedPage === entry.pageNumber
                              ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                              : "border-transparent bg-background text-muted-foreground hover:border-border",
                          )}
                        >
                          <span className="truncate font-semibold">Page {entry.label}</span>
                          <span className="flex items-center gap-1.5">
                            {query && matchingPages.has(entry.pageNumber) && <span className="size-1.5 rounded-full bg-primary" />}
                            <span className="hidden text-xs text-muted-foreground md:inline">{entry.wordCount}</span>
                          </span>
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </aside>
                <section className="flex min-h-0 flex-col bg-background">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Page {page?.label}</p>
                      <p className="text-xs text-muted-foreground">{page?.wordCount.toLocaleString()} words · {page?.characterCount.toLocaleString()} characters · {page?.imageObjectCount} image objects</p>
                    </div>
                    {page && !page.text && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">No text layer</Badge>}
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <pre lang={containsKhmer(page?.text ?? "") ? "km" : undefined} className="min-h-full whitespace-pre-wrap break-words p-4 font-sans text-sm leading-7 text-foreground sm:p-6">{page?.text || "No selectable text was found on this page. It may be a scanned image and need OCR."}</pre>
                  </ScrollArea>
                </section>
              </div>
            </TabsContent>

            <TabsContent value="overview" className="h-[min(62dvh,620px)] overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-6 p-5 sm:p-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Stat icon={<FileText />} label="Pages" value={result.pageCount} />
                    <Stat icon={<TextSelect />} label="Words" value={result.totalWords} />
                    <Stat icon={<ImageIcon />} label="Images" value={result.totalImageObjects} />
                    <Stat icon={<Clipboard />} label="Fields" value={result.formFieldCount} />
                    <Stat icon={<Info />} label="Notes" value={result.annotationCount} />
                    <Stat icon={<Paperclip />} label="Files" value={result.attachments.length} />
                  </div>
                  {result.scannedPageCount > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                      <strong>{result.scannedPageCount} page{result.scannedPageCount === 1 ? "" : "s"} had no selectable text.</strong> Those pages may be scans and require OCR to turn the image into text.
                    </div>
                  )}
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">Document metadata</h3>
                    <div className="mt-3 overflow-hidden rounded-xl border border-border">
                      {Object.entries(result.metadata).filter(([, value]) => value !== undefined && value !== "").length > 0 ? Object.entries(result.metadata).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => (
                        <div key={key} className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[180px_1fr]">
                          <dt className="text-xs font-semibold text-muted-foreground">{key}</dt>
                          <dd className="break-words text-sm text-foreground">{formatValue(value)}</dd>
                        </div>
                      )) : <p className="p-4 text-sm text-muted-foreground">No document metadata was found.</p>}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">Bookmarks</h3>
                    <div className="mt-3 rounded-xl border border-border p-4">
                      {result.outline.length > 0 ? <ol className="space-y-2">{result.outline.map((item, index) => <li key={`${item.title}-${index}`} className="text-sm text-foreground" style={{ paddingLeft: item.depth * 18 }}>{item.title}</li>)}</ol> : <p className="text-sm text-muted-foreground">No bookmarks were found.</p>}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="fields" className="h-[min(62dvh,620px)] overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-5 sm:p-6">
                  {result.pages.flatMap((entry) => entry.annotations.map((annotation, index) => ({ page: entry.label, annotation, index }))).map((item) => (
                    <div key={`${item.page}-${item.index}`} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Page {item.page}</Badge><span className="text-sm font-semibold text-foreground">{item.annotation.fieldName || item.annotation.subtype}</span>{item.annotation.fieldType && <span className="text-xs text-muted-foreground">{item.annotation.fieldType}</span>}</div>
                      {(item.annotation.contents || item.annotation.alternativeText || item.annotation.value !== undefined || item.annotation.url) && <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{item.annotation.contents || item.annotation.alternativeText || formatValue(item.annotation.value) || item.annotation.url}</p>}
                    </div>
                  ))}
                  {result.annotationCount === 0 && result.editorAnnotations.length === 0 && <EmptyMessage title="No fields or notes found" description="This PDF does not contain native form fields or PDF annotations." />}
                  {result.editorAnnotations.length > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"><strong>{result.editorAnnotations.length} editor item{result.editorAnnotations.length === 1 ? "" : "s"}</strong> are included in the JSON export.</div>}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="attachments" className="h-[min(62dvh,620px)] overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-5 sm:p-6">
                  {result.attachments.map((attachment) => <AttachmentRow key={`${attachment.name}-${attachment.size}`} attachment={attachment} />)}
                  {result.attachments.length === 0 && <EmptyMessage title="No embedded attachments" description="No files are attached inside this PDF." />}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : null}

        <DialogFooter className="border-t border-border px-4 py-3 sm:px-6">
          {result && !isExtracting && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <p className="hidden text-xs text-muted-foreground sm:block">Extraction stays in this browser.</p>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void copyText()}>{copied ? <Check className="size-4 text-emerald-600" /> : <Clipboard className="size-4" />}{copied ? "Copied" : "Copy text"}</Button>
                <Button type="button" variant="outline" size="sm" onClick={downloadText}><FileText className="size-4" /> TXT</Button>
                <Button type="button" size="sm" onClick={downloadJson}><Braces className="size-4" /> JSON</Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat(props: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-muted/50 p-3"><span className="text-primary [&_svg]:size-4">{props.icon}</span><p className="mt-3 text-xl font-bold text-foreground">{props.value.toLocaleString()}</p><p className="text-xs text-muted-foreground">{props.label}</p></div>;
}

function AttachmentRow(props: { attachment: PdfExtractedAttachment }) {
  const { attachment } = props;
  function download() {
    downloadBlob(new Blob([attachment.content]), attachment.fileName);
  }
  return <div className="flex items-center gap-3 rounded-xl border border-border p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Paperclip className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{attachment.fileName}</p><p className="text-xs text-muted-foreground">{formatBytes(attachment.size)}</p></div><Button type="button" variant="outline" size="sm" onClick={download}><Download className="size-4" /> Download</Button></div>;
}

function EmptyMessage(props: { title: string; description: string }) {
  return <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center"><Info className="size-6 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold text-foreground">{props.title}</p><p className="mt-1 text-sm text-muted-foreground">{props.description}</p></div>;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(fileName: string) {
  return fileName.replace(/\.pdf$/iu, "") || "pdf";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (["number", "boolean"].includes(typeof value)) return String(value);
  return JSON.stringify(value);
}

function containsKhmer(value: string) {
  return /[\u1780-\u17ff\u19e0-\u19ff]/u.test(value);
}
