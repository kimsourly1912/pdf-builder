"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { extractResumeFile } from "@/features/resumes/resume-client-extraction";
import { MAX_RESUME_UPLOAD_COUNT } from "@/features/resumes/resume.types";
import type { ResumeSource, ResumeStatus, ResumeSummary } from "@/features/resumes/resume.types";
import { formatLocalDateTime, resolvedLocalTimeZone } from "@/features/templates/date-time";

type ResumeStats = { total: number; ready: number; needsAttention: number; possibleDuplicates: number };

const SOURCE_LABELS: Record<ResumeSource, string> = {
  telegram: "Telegram",
  facebook_messenger: "Facebook Messenger",
  whatsapp: "WhatsApp",
  email: "Email",
  walk_in: "Walk-in",
  other: "Other",
};

export function ResumeLibrary(props: { displayName: string }) {
  const [items, setItems] = useState<ResumeSummary[]>([]);
  const [stats, setStats] = useState<ResumeStats>({ total: 0, ready: 0, needsAttention: 0, possibleDuplicates: 0 });
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ResumeStatus | "">("");
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
      if (status) query.set("status", status);
      if (source) query.set("source", source);
      if (receivedFrom) query.set("receivedFrom", receivedFrom);
      if (receivedTo) query.set("receivedTo", receivedTo);
      const response = await fetch(`/api/resumes?${query}`, { cache: "no-store" });
      const payload = (await response.json()) as { items?: ResumeSummary[]; stats?: ResumeStats; error?: string };
      if (!response.ok) throw new Error(payload.error || "Resumes could not be loaded.");
      setItems(payload.items ?? []);
      setStats(payload.stats ?? { total: 0, ready: 0, needsAttention: 0, possibleDuplicates: 0 });
      setSelected(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resumes could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [receivedFrom, receivedTo, search, source, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimeZone(resolvedLocalTimeZone());
      void loadResumes();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadResumes]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const selectedItems = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);

  async function retrySelected() {
    if (selectedItems.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    let completed = 0;
    try {
      for (const item of selectedItems) {
        const fileResponse = await fetch(`/api/resumes/${item.id}/download`, { cache: "no-store" });
        if (!fileResponse.ok) throw new Error(`Could not open ${item.fileName}.`);
        const file = new File([await fileResponse.blob()], item.fileName, { type: "application/pdf" });
        const extraction = await extractResumeFile(file);
        const response = await fetch(`/api/resumes/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry_extraction", extraction }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || `Could not retry ${item.fileName}.`);
        completed += 1;
      }
      setNotice(`Extraction completed for ${completed} resume${completed === 1 ? "" : "s"}.`);
      await loadResumes();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resume extraction could not be retried.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selectedItems.length === 0 || !window.confirm(`Permanently delete ${selectedItems.length} resume PDF${selectedItems.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setError("");
    try {
      for (const item of selectedItems) {
        const response = await fetch(`/api/resumes/${item.id}`, { method: "DELETE" });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error || `Could not delete ${item.fileName}.`);
        }
      }
      setNotice("Selected resumes were permanently deleted.");
      await loadResumes();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Selected resumes could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm"><Link href="/templates" aria-label="Back to templates"><ArrowLeft /></Link></Button>
            <div className="min-w-0"><p className="truncate text-sm font-bold">Resume Library</p><p className="truncate text-xs text-slate-400">Private candidate CV collection</p></div>
          </div>
          <div className="flex items-center gap-2"><span className="hidden max-w-40 truncate text-xs text-slate-500 sm:block">{props.displayName}</span><SignOutButton /><Button asChild variant="outline" size="sm"><Link href="/accounts"><UsersRound className="size-4" /> Accounts</Link></Button><Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setUploadOpen(true)}><UploadCloud className="size-4" /> Upload PDFs</Button></div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total resumes" value={stats.total} icon={<FileText />} color="blue" />
          <StatCard label="Ready" value={stats.ready} icon={<CheckCircle2 />} color="emerald" />
          <StatCard label="Needs attention" value={stats.needsAttention} icon={<AlertTriangle />} color="amber" />
          <StatCard label="Possible duplicates" value={stats.possibleDuplicates} icon={<UsersRound />} color="rose" />
        </section>
        {(error || notice) && <p role={error ? "alert" : "status"} className={`mt-5 rounded-xl border px-4 py-3 text-sm font-medium ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</p>}
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><span className="sr-only">Search resumes</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email, filename, or position" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value as ResumeStatus | "")} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option><option value="ready">Ready</option><option value="needs_attention">Needs attention</option><option value="possible_duplicate">Possible duplicate</option><option value="failed">Failed</option></select>
            <select value={source} onChange={(event) => setSource(event.target.value as ResumeSource | "")} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">All sources</option>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Received from<input type="date" value={receivedFrom} onChange={(event) => setReceivedFrom(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case text-slate-700" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Received to<input type="date" value={receivedTo} min={receivedFrom || undefined} onChange={(event) => setReceivedTo(event.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal normal-case text-slate-700" /></label>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadResumes()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          </div>
          {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-800"><span className="mr-auto">{selected.size} selected</span><Button size="sm" variant="outline" disabled={busy} onClick={() => void retrySelected()}><RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> Retry extraction</Button><Button size="sm" variant="outline" disabled={busy} className="text-rose-600" onClick={() => void deleteSelected()}><Trash2 className="size-3.5" /> Delete</Button></div>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select all resumes" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))} /></th><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Applied position</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Received</th><th className="px-3 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{items.map((item) => { const candidate = item.candidate ?? item.duplicateCandidate; return <tr key={item.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${item.fileName}`} checked={selected.has(item.id)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} /></td><td className="px-3 py-3"><p className="max-w-48 truncate font-semibold text-slate-800">{candidate?.fullName || "Unknown candidate"}</p><p className="max-w-48 truncate text-xs text-slate-400">{item.fileName} · {item.pageCount}p</p></td><td className="px-3 py-3"><p className="max-w-52 truncate text-xs">{candidate?.email || "No email"}</p><p className="max-w-52 truncate text-xs text-slate-400">{candidate?.phone || "No phone"}</p></td><td className="px-3 py-3 text-xs text-slate-600">{item.appliedPosition || "—"}</td><td className="px-3 py-3 text-xs">{SOURCE_LABELS[item.source]}</td><td className="px-3 py-3"><p className="text-xs">{item.receivedDate}</p><p className="text-[11px] text-slate-400">{formatLocalDateTime(item.createdAt, { timeZone })}</p></td><td className="px-3 py-3"><StatusBadge status={item.status} /></td><td className="px-4 py-3 text-right"><Button asChild variant="outline" size="sm"><Link href={`/resumes/${item.id}`}><FileSearch className="size-3.5" /> Review</Link></Button></td></tr>; })}</tbody>
            </table>
          </div>
          {!loading && items.length === 0 && <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><FileText className="size-9 text-slate-300" /><h2 className="mt-3 font-bold">No resumes found</h2><p className="mt-1 text-sm text-slate-400">Upload PDF resumes or change the current filters.</p></div>}
          {loading && <div className="flex min-h-64 items-center justify-center text-slate-400"><LoaderCircle className="size-6 animate-spin" /></div>}
        </section>
      </div>
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} onUploaded={async (count) => { setUploadOpen(false); setNotice(`${count} resume${count === 1 ? "" : "s"} uploaded.`); await loadResumes(); }} />}
    </main>
  );
}

function UploadDialog(props: { onClose: () => void; onUploaded: (count: number) => Promise<void> }) {
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
    if (files.length === 0) { setError("Choose at least one PDF."); return; }
    setUploading(true); setError("");
    let completed = 0;
    try {
      for (const [index, file] of files.entries()) {
        setProgress(`Processing ${index + 1} of ${files.length}: ${file.name}`);
        const formData = new FormData();
        formData.set("file", file); formData.set("source", source); formData.set("appliedPosition", appliedPosition); formData.set("receivedDate", receivedDate); formData.set("note", note);
        try { formData.set("extraction", JSON.stringify(await extractResumeFile(file))); }
        catch (cause) {
          if (cause instanceof Error && /20 pages|15 MB/u.test(cause.message)) throw cause;
          formData.set("extractionFailed", "true");
        }
        const response = await fetch("/api/resumes", { method: "POST", body: formData });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(`${file.name}: ${payload.error || "Upload failed."}`);
        completed += 1;
      }
      await props.onUploaded(completed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The resumes could not be uploaded."); }
    finally { setUploading(false); setProgress(""); }
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="resume-upload-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><form onSubmit={upload} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="resume-upload-title" className="text-lg font-bold">Upload resume PDFs</h2><p className="mt-1 text-xs text-slate-400">Up to 10 PDFs, 15 MB and 20 pages each. Images are not accepted.</p></div><Button type="button" variant="ghost" size="icon-sm" onClick={props.onClose} disabled={uploading}><X /></Button></div>{error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}<label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center hover:border-blue-300"><UploadCloud className="size-7 text-blue-500" /><span className="mt-2 text-sm font-semibold">Choose PDF resumes</span><span className="mt-1 text-xs text-slate-400">{files.length > 0 ? `${files.length} selected` : "PDF only"}</span><input type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(event) => { const next = Array.from(event.target.files ?? []); if (next.length > MAX_RESUME_UPLOAD_COUNT) setError("Choose at most 10 PDFs at once."); else { setFiles(next); setError(""); } }} /></label>{files.length > 0 && <ul className="mt-3 max-h-28 space-y-1 overflow-auto text-xs text-slate-600">{files.map((file) => <li key={`${file.name}:${file.size}`} className="truncate rounded bg-slate-50 px-2 py-1.5">{file.name} · {formatBytes(file.size)}</li>)}</ul>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Source"><select value={source} onChange={(event) => setSource(event.target.value as ResumeSource)} className={inputClassName}>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Received date"><input type="date" required value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} className={inputClassName} /></Field><Field label="Applied position (optional)"><input value={appliedPosition} maxLength={120} onChange={(event) => setAppliedPosition(event.target.value)} className={inputClassName} /></Field><Field label="HR note (optional)"><input value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} className={inputClassName} /></Field></div>{progress && <p className="mt-4 text-xs font-medium text-blue-700">{progress}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={props.onClose} disabled={uploading}>Cancel</Button><Button type="submit" disabled={uploading || files.length === 0} className="bg-blue-600 hover:bg-blue-700">{uploading ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{uploading ? "Processing…" : `Upload ${files.length || ""}`}</Button></div></form></div>;
}

function StatusBadge(props: { status: ResumeStatus }) { const styles: Record<ResumeStatus, string> = { ready: "bg-emerald-100 text-emerald-700", needs_attention: "bg-amber-100 text-amber-700", possible_duplicate: "bg-rose-100 text-rose-700", failed: "bg-slate-200 text-slate-700" }; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[props.status]}`}>{props.status.replaceAll("_", " ")}</span>; }
function StatCard(props: { label: string; value: number; icon: React.ReactNode; color: "blue" | "emerald" | "amber" | "rose" }) { const colors = { blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", rose: "bg-rose-50 text-rose-600" }; return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`flex size-11 items-center justify-center rounded-xl [&_svg]:size-5 ${colors[props.color]}`}>{props.icon}</span><div><p className="text-2xl font-bold tabular-nums">{props.value}</p><p className="text-xs font-medium text-slate-400">{props.label}</p></div></div>; }
function Field(props: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-slate-600">{props.label}{props.children}</label>; }
const inputClassName = "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-blue-500";
function localDate() { return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
