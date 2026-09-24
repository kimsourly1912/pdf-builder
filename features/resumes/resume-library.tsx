"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  UploadCloud,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/patterns/app-shell";
import { DataView, DataViewContent, DataViewHeader } from "@/components/patterns/data-view";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageHeader } from "@/components/patterns/page-header";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { StatusBadge } from "@/components/patterns/status-badge";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { extractResumeFile } from "@/features/resumes/resume-client-extraction";
import { pageMetaFromPayload } from "@/features/pagination/pagination";
import type { PageMeta } from "@/features/pagination/pagination";
import { MAX_RESUME_UPLOAD_COUNT } from "@/features/resumes/resume.types";
import type {
  ResumeExtractionStatus,
  ResumeSource,
  ResumeSummary,
  ResumeVerificationStatus,
} from "@/features/resumes/resume.types";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";

type ResumeStats = {
  total: number;
  verified: number;
  needsAttention: number;
  possibleDuplicates: number;
};

type UploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (count: number) => Promise<void>;
};

const EMPTY_STATS: ResumeStats = {
  total: 0,
  verified: 0,
  needsAttention: 0,
  possibleDuplicates: 0,
};

const EMPTY_PAGE_META: PageMeta = {
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false,
};

const SOURCE_LABELS: Record<ResumeSource, string> = {
  telegram: "Telegram",
  facebook_messenger: "Facebook Messenger",
  whatsapp: "WhatsApp",
  email: "Email",
  walk_in: "Walk-in",
  other: "Other",
};

function ResumeLibrary(props: { displayName: string }) {
  const [items, setItems] = useState<ResumeSummary[]>([]);
  const [stats, setStats] = useState<ResumeStats>(EMPTY_STATS);
  const [pageMeta, setPageMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [extractionStatus, setExtractionStatus] = useState<ResumeExtractionStatus | "">("");
  const [verificationStatus, setVerificationStatus] = useState<ResumeVerificationStatus | "">("");
  const [possibleDuplicate, setPossibleDuplicate] = useState(false);
  const [source, setSource] = useState<ResumeSource | "">("");
  const [receivedFrom, setReceivedFrom] = useState("");
  const [receivedTo, setReceivedTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");

  const loadResumes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (extractionStatus) query.set("extractionStatus", extractionStatus);
      if (verificationStatus) query.set("verificationStatus", verificationStatus);
      if (possibleDuplicate) query.set("possibleDuplicate", "true");
      if (source) query.set("source", source);
      if (receivedFrom) query.set("receivedFrom", receivedFrom);
      if (receivedTo) query.set("receivedTo", receivedTo);
      query.set("page", String(pageMeta.page));
      query.set("pageSize", String(pageMeta.pageSize));
      const response = await fetch(`/api/resumes?${query}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        items?: ResumeSummary[];
        stats?: ResumeStats;
        page?: number;
        pageSize?: number;
        totalItems?: number;
        totalPages?: number;
        hasPreviousPage?: boolean;
        hasNextPage?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Resumes could not be loaded.");
      }
      setItems(payload.items ?? []);
      setStats(payload.stats ?? EMPTY_STATS);
      setPageMeta((current) => pageMetaFromPayload(payload, current));
      setSelected(new Set());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Resumes could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [pageMeta.page, pageMeta.pageSize, receivedFrom, receivedTo, search, source, extractionStatus, verificationStatus, possibleDuplicate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimeZone(resolvedLocalTimeZone());
      void loadResumes();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadResumes]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );
  const activeFilterCount = [extractionStatus, verificationStatus, possibleDuplicate, source, receivedFrom, receivedTo].filter(
    Boolean,
  ).length;

  async function retrySelected() {
    if (selectedItems.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    let completed = 0;
    try {
      for (const item of selectedItems) {
        const fileResponse = await fetch(`/api/resumes/${item.id}/download`, {
          cache: "no-store",
        });
        if (!fileResponse.ok) throw new Error(`Could not open ${item.fileName}.`);
        const file = new File([await fileResponse.blob()], item.fileName, {
          type: "application/pdf",
        });
        const extraction = await extractResumeFile(file);
        const response = await fetch(`/api/resumes/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry_extraction", extraction }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || `Could not retry ${item.fileName}.`);
        }
        completed += 1;
      }
      setNotice(
        `Extraction completed for ${completed} resume${completed === 1 ? "" : "s"}.`,
      );
      await loadResumes();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Resume extraction could not be retried.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selectedItems.length === 0) return;
    setBusy(true);
    setError("");
    try {
      for (const item of selectedItems) {
        const response = await fetch(`/api/resumes/${item.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || `Could not delete ${item.fileName}.`);
        }
      }
      setDeleteOpen(false);
      setNotice("Selected resumes were permanently deleted.");
      await loadResumes();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Selected resumes could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setExtractionStatus("");
    setVerificationStatus("");
    setPossibleDuplicate(false);
    setSource("");
    setReceivedFrom("");
    setReceivedTo("");
    setPageMeta((current) => ({ ...current, page: 1 }));
    setFiltersOpen(false);
  }

  function toggleItem(itemId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  return (
    <AppShell displayName={props.displayName}>
      <PageHeader
        title="Resume Library"
        description="Keep candidate CVs private, searchable, and ready for structured review."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <UploadCloud /> Upload PDFs
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total resumes" value={stats.total} icon={<FileText />} tone="primary" />
        <MetricCard label="Verified" value={stats.verified} icon={<CheckCircle2 />} tone="success" />
        <MetricCard label="Needs attention" value={stats.needsAttention} icon={<AlertTriangle />} tone="warning" />
        <MetricCard label="Possible duplicates" value={stats.possibleDuplicates} icon={<UsersRound />} />
      </section>

      {error && <FeedbackAlert tone="error" title="Something went wrong" description={error} />}
      {notice && <FeedbackAlert tone="success" title="Updated successfully" description={notice} />}

      <DataView>
        <DataViewHeader>
          <div className="w-full max-w-xl">
            <InputGroup>
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPageMeta((current) => ({ ...current, page: 1 }));
                }}
                placeholder="Search name, phone, email, filename, or position"
                aria-label="Search resumes"
              />
            </InputGroup>
          </div>
          <div className="flex flex-wrap gap-2">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontal /> Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded bg-primary px-1.5 text-xs text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
                <PopoverHeader className="border-b p-4">
                  <PopoverTitle>Filter resumes</PopoverTitle>
                  <PopoverDescription>Narrow the library by extraction, verification, source, or received date.</PopoverDescription>
                </PopoverHeader>
                <div className="grid gap-4 p-4">
                  <FormField label="Extraction status">
                    <Select
                      value={extractionStatus || "all-extraction"}
                      onValueChange={(value) =>
                        {
                          setExtractionStatus(value === "all-extraction" ? "" : value as ResumeExtractionStatus);
                          setPageMeta((current) => ({ ...current, page: 1 }));
                        }
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-extraction">All extraction statuses</SelectItem>
                        <SelectItem value="queued">Queued</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Resume verification">
                    <Select
                      value={verificationStatus || "all-verification"}
                      onValueChange={(value) => {
                        setVerificationStatus(value === "all-verification" ? "" : value as ResumeVerificationStatus);
                        setPageMeta((current) => ({ ...current, page: 1 }));
                      }}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-verification">All verification statuses</SelectItem>
                        <SelectItem value="unverified">Unverified</SelectItem>
                        <SelectItem value="needs_attention">Needs attention</SelectItem>
                        <SelectItem value="verified">Verified</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <Checkbox checked={possibleDuplicate} onCheckedChange={(value) => {
                      setPossibleDuplicate(value === true);
                      setPageMeta((current) => ({ ...current, page: 1 }));
                    }} /> Possible duplicates only
                  </label>
                  <FormField label="Source">
                    <Select
                      value={source || "all-sources"}
                      onValueChange={(value) =>
                        {
                          setSource(value === "all-sources" ? "" : value as ResumeSource);
                          setPageMeta((current) => ({ ...current, page: 1 }));
                        }
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all-sources">All sources</SelectItem>
                        {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Received from">
                      <DatePicker
                        value={receivedFrom}
                        max={receivedTo || undefined}
                        onValueChange={(value) => {
                          setReceivedFrom(value);
                          setPageMeta((current) => ({ ...current, page: 1 }));
                        }}
                        placeholder="From date"
                        aria-label="Received from date"
                      />
                    </FormField>
                    <FormField label="Received to">
                      <DatePicker
                        value={receivedTo}
                        min={receivedFrom || undefined}
                        onValueChange={(value) => {
                          setReceivedTo(value);
                          setPageMeta((current) => ({ ...current, page: 1 }));
                        }}
                        placeholder="To date"
                        aria-label="Received to date"
                      />
                    </FormField>
                  </div>
                </div>
                <div className="flex justify-between border-t p-4">
                  <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
                  <Button type="button" size="sm" onClick={() => setFiltersOpen(false)}>Done</Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadResumes()}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
        </DataViewHeader>

        <DataViewContent>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-primary/5 px-4 py-2.5 text-xs font-medium">
              <span className="mr-auto">{selected.size} selected</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void retrySelected()}>
                <RefreshCw className={busy ? "animate-spin" : ""} /> Retry extraction
              </Button>
              <Button size="sm" variant="outline" disabled={busy} className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex min-h-72 items-center justify-center text-muted-foreground">
              <LoaderCircle className="size-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="min-h-72">
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                <EmptyTitle>No resumes found</EmptyTitle>
                <EmptyDescription>Upload PDF resumes or change the current filters.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1050px]">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 px-4">
                      <Checkbox
                        aria-label="Select all resumes"
                        checked={allSelected}
                        onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))}
                      />
                    </TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Applied position</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Extraction</TableHead>
                    <TableHead>Resume verification</TableHead>
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const candidate = item.candidate ?? item.duplicateCandidate;
                    return (
                      <TableRow key={item.id} data-state={selected.has(item.id) ? "selected" : undefined}>
                        <TableCell className="px-4 py-2.5">
                          <Checkbox aria-label={`Select ${item.fileName}`} checked={selected.has(item.id)} onCheckedChange={() => toggleItem(item.id)} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <p className="max-w-48 truncate font-medium">{candidate?.fullName || "Unknown candidate"}</p>
                          <p className="max-w-48 truncate text-xs text-muted-foreground">{item.fileName} · {item.pageCount}p</p>
                          {item.duplicateCandidate && <span className="text-xs text-destructive">Possible duplicate</span>}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <p className="max-w-52 truncate text-xs">{candidate?.email || "No email"}</p>
                          <p className="max-w-52 truncate text-xs text-muted-foreground">{candidate?.phone || "No phone"}</p>
                        </TableCell>
                        <TableCell className="py-2.5 text-xs">{item.appliedPosition || "—"}</TableCell>
                        <TableCell className="py-2.5 text-xs">{SOURCE_LABELS[item.source]}</TableCell>
                        <TableCell className="py-2.5">
                          <p className="text-xs">{item.receivedDate}</p>
                          <p className="text-[11px] text-muted-foreground">{formatLocalDateTime(item.createdAt, { timeZone })}</p>
                        </TableCell>
                        <TableCell className="py-2.5"><ExtractionStatusBadge status={item.extractionStatus} /></TableCell>
                        <TableCell className="py-2.5"><VerificationStatusBadge status={item.verificationStatus} /></TableCell>
                        <TableCell className="py-2.5 pr-4 text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/resumes/${item.id}`}><FileSearch /> Review</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <ServerPagination
            meta={pageMeta}
            disabled={loading || busy}
            onPageChange={(page) => setPageMeta((current) => ({ ...current, page }))}
            onPageSizeChange={(pageSize) => setPageMeta((current) => ({ ...current, page: 1, pageSize }))}
          />
        </DataViewContent>
      </DataView>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={async (count) => {
          setUploadOpen(false);
          setNotice(`${count} resume${count === 1 ? "" : "s"} uploaded.`);
          await loadResumes();
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive"><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Delete selected resumes permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {selectedItems.length} resume PDF{selectedItems.length === 1 ? "" : "s"} and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void deleteSelected()}>
              {busy && <LoaderCircle className="animate-spin" />} Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function UploadDialog(props: UploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<ResumeSource>("telegram");
  const [appliedPosition, setAppliedPosition] = useState("");
  const [receivedDate, setReceivedDate] = useState(localDate());
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one PDF.");
      return;
    }
    setUploading(true);
    setError("");
    let completed = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`Processing ${index + 1} of ${files.length}: ${file.name}`);
        const formData = new FormData();
        formData.set("file", file);
        formData.set("source", source);
        formData.set("appliedPosition", appliedPosition);
        formData.set("receivedDate", receivedDate);
        formData.set("note", note);
        try {
          formData.set("extraction", JSON.stringify(await extractResumeFile(file)));
        } catch (cause) {
          if (cause instanceof Error && /20 pages|15 MB/u.test(cause.message)) throw cause;
          formData.set("extractionFailed", "true");
        }
        const response = await fetch("/api/resumes", { method: "POST", body: formData });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(`${file.name}: ${payload.error || "Upload failed."}`);
        completed += 1;
      }
      await props.onUploaded(completed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The resumes could not be uploaded.");
    } finally {
      setUploading(false);
      setProgress("");
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={upload}>
          <DialogHeader>
            <DialogTitle>Upload resume PDFs</DialogTitle>
            <DialogDescription>Up to 10 PDFs, 15 MB and 20 pages each. Images are not accepted.</DialogDescription>
          </DialogHeader>
          {error && <FeedbackAlert tone="error" title="Upload failed" description={error} className="mt-4" />}
          <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 p-5 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
            <UploadCloud className="size-7 text-primary" />
            <span className="mt-2 text-sm font-semibold">Choose PDF resumes</span>
            <span className="mt-1 text-xs text-muted-foreground">{files.length > 0 ? `${files.length} selected` : "PDF only"}</span>
            <input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(event) => {
              const next = Array.from(event.target.files ?? []);
              if (next.length > MAX_RESUME_UPLOAD_COUNT) setError("Choose at most 10 PDFs at once.");
              else { setFiles(next); setError(""); }
            }} />
          </label>
          {files.length > 0 && (
            <ul className="mt-3 max-h-28 space-y-1 overflow-auto text-xs text-muted-foreground">
              {files.map((file) => (
                <li key={`${file.name}:${file.size}`} className="truncate rounded-md bg-muted px-2 py-1.5">{file.name} · {formatBytes(file.size)}</li>
              ))}
            </ul>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <FormField label="Source">
              <Select
                value={source}
                onValueChange={(value) => setSource(value as ResumeSource)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Received date">
              <DatePicker
                value={receivedDate}
                onValueChange={setReceivedDate}
                aria-label="Resume received date"
                required
              />
            </FormField>
            <FormField label="Applied position (optional)"><Input value={appliedPosition} maxLength={120} onChange={(event) => setAppliedPosition(event.target.value)} /></FormField>
            <FormField label="HR note (optional)"><Input value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></FormField>
          </div>
          {progress && <p className="mt-4 text-xs font-medium text-primary">{progress}</p>}
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)} disabled={uploading}>Cancel</Button>
            <Button type="submit" disabled={uploading || files.length === 0}>
              {uploading ? <LoaderCircle className="animate-spin" /> : <UploadCloud />}
              {uploading ? "Processing…" : `Upload ${files.length || ""}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExtractionStatusBadge(props: { status: ResumeExtractionStatus }) {
  const tone = props.status === "completed" ? "success" : props.status === "failed" ? "danger" : "neutral";
  return <StatusBadge label={props.status} tone={tone} />;
}

function VerificationStatusBadge(props: { status: ResumeVerificationStatus }) {
  const tone =
    props.status === "verified"
      ? "success"
      : props.status === "needs_attention"
        ? "warning"
        : "neutral";
  return <StatusBadge label={props.status.replaceAll("_", " ")} tone={tone} />;
}

function FormField(props: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-xs font-semibold">{props.label}{props.children}</label>;
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatBytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.ceil(value / 1024)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export { ResumeLibrary };
