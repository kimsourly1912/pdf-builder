"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Save,
  Trash2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { extractResumeFile } from "@/features/resumes/resume-client-extraction";
import type { ResumeCandidateSummary, ResumeDetail, ResumeExtractionFields } from "@/features/resumes/resume.types";

type CandidateDraft = Omit<ResumeCandidateSummary, "id" | "verificationStatus">;

export function ResumeDetailView(props: { resumeId: string }) {
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [draft, setDraft] = useState<CandidateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadResume = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, { cache: "no-store" });
      const payload = (await response.json()) as { resume?: ResumeDetail; error?: string };
      if (!response.ok || !payload.resume) throw new Error(payload.error || "The resume could not be loaded.");
      setResume(payload.resume);
      setDraft(payload.resume.candidate ? candidateDraft(payload.resume.candidate) : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The resume could not be loaded."); }
    finally { setLoading(false); }
  }, [props.resumeId]);

  useEffect(() => { const timer = window.setTimeout(() => void loadResume(), 0); return () => window.clearTimeout(timer); }, [loadResume]);

  async function saveCandidate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_candidate", candidate: draft }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Candidate information could not be saved.");
      setNotice("Candidate information verified and saved.");
      await loadResume();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Candidate information could not be saved."); }
    finally { setBusy(false); }
  }

  async function linkDuplicate() {
    if (!resume?.duplicateCandidate) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link_candidate", candidateId: resume.duplicateCandidate.id }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Candidate could not be linked.");
      setNotice("Resume linked to the existing candidate. Existing verified data was preserved.");
      await loadResume();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Candidate could not be linked."); }
    finally { setBusy(false); }
  }

  async function retryExtraction() {
    if (!resume) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const fileResponse = await fetch(`/api/resumes/${resume.id}/download`, { cache: "no-store" });
      if (!fileResponse.ok) throw new Error("The PDF could not be opened for extraction.");
      const file = new File([await fileResponse.blob()], resume.fileName, { type: "application/pdf" });
      const extraction = await extractResumeFile(file);
      const response = await fetch(`/api/resumes/${resume.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry_extraction", extraction }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Extraction could not be retried.");
      setNotice("Resume extraction completed.");
      await loadResume();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Extraction could not be retried."); }
    finally { setBusy(false); }
  }

  async function deleteResume() {
    if (!resume || !window.confirm("Permanently delete this resume PDF and its extraction history?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/resumes/${resume.id}`, { method: "DELETE" });
      if (!response.ok) { const payload = (await response.json()) as { error?: string }; throw new Error(payload.error || "Resume could not be deleted."); }
      window.location.assign("/resumes");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Resume could not be deleted."); setBusy(false); }
  }

  if (loading) return <CenteredState title="Opening resume…" icon={<LoaderCircle className="animate-spin" />} />;
  if (!resume) return <CenteredState title={error || "Resume not found"} icon={<AlertTriangle />} />;
  const fields = resume.extraction?.fields;

  return <main className="min-h-screen bg-slate-100 text-slate-950"><header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-3 px-4 py-2 sm:px-6"><div className="flex min-w-0 items-center gap-3"><Button asChild variant="ghost" size="icon-sm"><Link href="/resumes" aria-label="Back to resumes"><ArrowLeft /></Link></Button><div className="min-w-0"><p className="truncate text-sm font-bold">{resume.candidate?.fullName || resume.fileName}</p><p className="truncate text-xs text-slate-400">{resume.fileName} · Extraction v{resume.extractionVersion ?? "—"}</p></div></div><div className="flex items-center gap-2"><Button asChild variant="outline" size="sm"><a href={`/api/resumes/${resume.id}/download`} download><Download className="size-4" /> Download</a></Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void retryExtraction()}><RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> Retry</Button><Button variant="outline" size="sm" disabled={busy} className="text-rose-600" onClick={() => void deleteResume()}><Trash2 className="size-4" /> Delete</Button></div></div></header><div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">{(error || notice) && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{error || notice}</p>}{resume.status === "possible_duplicate" && resume.duplicateCandidate && <div className="mb-4 space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0 text-rose-600" /><div className="min-w-0 flex-1"><p className="font-bold text-rose-900">Possible existing candidate</p><p className="mt-1 text-sm text-rose-700">Matched {resume.duplicateCandidate.fullName || "an existing candidate"} using email or phone. Review before linking; existing data will not be overwritten.</p></div><Button disabled={busy} onClick={() => void linkDuplicate()} className="bg-rose-600 hover:bg-rose-700"><UserCheck className="size-4" /> Link candidate</Button></div><DuplicateComparison existing={resume.duplicateCandidate} fields={fields} /></div>}<div className="grid items-start gap-5 xl:grid-cols-[minmax(500px,1fr)_minmax(430px,560px)]"><section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-800 shadow-sm xl:sticky xl:top-20"><iframe title={`Preview ${resume.fileName}`} src={`/api/resumes/${resume.id}/download`} className="h-[calc(100vh-7rem)] min-h-[650px] w-full bg-white" /></section><section className="space-y-4"><ResumeMeta resume={resume} />{draft ? <form onSubmit={saveCandidate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h1 className="font-bold">Candidate information</h1><p className="mt-1 text-xs text-slate-400">Correct extracted values, then save to mark them verified.</p></div>{resume.candidate?.verificationStatus === "verified" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700"><CheckCircle2 className="size-3" /> Verified</span> : <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">Extracted</span>}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><TextField label="Full name" value={draft.fullName} onChange={(value) => setDraft({ ...draft, fullName: value })} meta={fields?.fullName} /><TextField label="Current title" value={draft.currentTitle} onChange={(value) => setDraft({ ...draft, currentTitle: value })} meta={fields?.currentTitle} /><TextField label="Email" type="email" value={draft.email} onChange={(value) => setDraft({ ...draft, email: value })} meta={fields?.emails} /><TextField label="Phone" value={draft.phone} onChange={(value) => setDraft({ ...draft, phone: value })} meta={fields?.phones} /><TextField label="Date of birth" type="date" value={draft.dateOfBirth ?? ""} onChange={(value) => setDraft({ ...draft, dateOfBirth: value || null })} meta={fields?.dateOfBirth} /><TextField label="Gender" value={draft.gender} onChange={(value) => setDraft({ ...draft, gender: value })} meta={fields?.gender} /><TextField label="Nationality" value={draft.nationality} onChange={(value) => setDraft({ ...draft, nationality: value })} meta={fields?.nationality} /><div className="sm:col-span-2"><TextField label="Address" value={draft.address} onChange={(value) => setDraft({ ...draft, address: value })} meta={fields?.address} /></div><div className="sm:col-span-2"><TextAreaField label="Professional summary" value={draft.professionalSummary} onChange={(value) => setDraft({ ...draft, professionalSummary: value })} meta={fields?.professionalSummary} /></div>{(["skills", "workExperience", "education", "certifications", "languages", "links"] as const).map((key) => <TextAreaField key={key} label={fieldLabel(key)} value={draft[key].join("\n")} onChange={(value) => setDraft({ ...draft, [key]: lines(value) })} meta={fields?.[key]} />)}</div><Button type="submit" disabled={busy} className="mt-5 w-full bg-blue-600 hover:bg-blue-700">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Save and verify candidate</Button></form> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><AlertTriangle className="size-6 text-amber-600" /><h2 className="mt-3 font-bold text-amber-900">Candidate profile needs attention</h2><p className="mt-1 text-sm leading-6 text-amber-700">No new profile was created because extraction failed or this resume may belong to an existing candidate. Retry extraction or link the suggested candidate.</p></div>}</section></div></div></main>;
}

function DuplicateComparison(props: { existing: ResumeCandidateSummary; fields: ResumeExtractionFields | undefined }) {
  const rows = [
    ["Name", props.fields?.fullName.value ?? "—", props.existing.fullName || "—"],
    ["Email", props.fields?.emails.value?.[0] ?? "—", props.existing.email || "—"],
    ["Phone", props.fields?.phones.value?.[0] ?? "—", props.existing.phone || "—"],
    ["Position", props.fields?.currentTitle.value ?? "—", props.existing.currentTitle || "—"],
  ];
  return <div className="overflow-hidden rounded-lg border border-rose-200 bg-white"><div className="grid grid-cols-[90px_1fr_1fr] bg-rose-100/70 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-rose-700"><span>Field</span><span>Extracted PDF</span><span>Existing candidate</span></div>{rows.map(([label, extracted, existing]) => <div key={label} className="grid grid-cols-[90px_1fr_1fr] gap-2 border-t border-rose-100 px-3 py-2 text-xs"><span className="font-semibold text-slate-500">{label}</span><span className="break-words text-slate-700">{extracted}</span><span className="break-words text-slate-700">{existing}</span></div>)}</div>;
}

function ResumeMeta(props: { resume: ResumeDetail }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FileText className="size-5" /></span><div><h2 className="font-bold">Resume intake</h2><p className="text-xs text-slate-400">Original PDF and processing state</p></div></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><Meta label="Status" value={props.resume.status.replaceAll("_", " ")} /><Meta label="Pages" value={String(props.resume.pageCount)} /><Meta label="Source" value={props.resume.source.replaceAll("_", " ")} /><Meta label="Received" value={props.resume.receivedDate} /><Meta label="Applied position" value={props.resume.appliedPosition || "—"} /><Meta label="File size" value={`${(props.resume.fileSize / 1024 / 1024).toFixed(1)} MB`} /></dl>{props.resume.note && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{props.resume.note}</p>}{props.resume.errorMessage && <p className="mt-3 text-xs font-medium text-rose-600">{props.resume.errorMessage}</p>}{props.resume.extraction && props.resume.extraction.scannedPageCount > 0 && <p className="mt-3 text-xs text-amber-700">{props.resume.extraction.scannedPageCount} page(s) had little or no selectable text. Review those pages manually.</p>}</div>; }
function Meta(props: { label: string; value: string }) { return <div><dt className="font-semibold uppercase tracking-wide text-slate-400">{props.label}</dt><dd className="mt-1 capitalize text-slate-700">{props.value}</dd></div>; }
function TextField(props: { label: string; value: string; type?: string; onChange: (value: string) => void; meta?: ResumeExtractionFields[keyof ResumeExtractionFields] }) { return <label className="block text-xs font-semibold text-slate-600">{props.label}<input type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-normal outline-none focus:border-blue-500" /><Confidence meta={props.meta} /></label>; }
function TextAreaField(props: { label: string; value: string; onChange: (value: string) => void; meta?: ResumeExtractionFields[keyof ResumeExtractionFields] }) { return <label className="block text-xs font-semibold text-slate-600">{props.label}<textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-blue-500" /><Confidence meta={props.meta} /></label>; }
function Confidence(props: { meta?: ResumeExtractionFields[keyof ResumeExtractionFields] }) { if (!props.meta) return null; return <span className="mt-1 block text-[10px] font-normal text-slate-400">{props.meta.verification === "verified" ? "Verified by HR" : `Extracted · ${Math.round(props.meta.confidence * 100)}% confidence${props.meta.sourcePage ? ` · page ${props.meta.sourcePage}` : ""}`}</span>; }
function candidateDraft(candidate: ResumeCandidateSummary): CandidateDraft { return { fullName: candidate.fullName, email: candidate.email, phone: candidate.phone, address: candidate.address, dateOfBirth: candidate.dateOfBirth, gender: candidate.gender, nationality: candidate.nationality, currentTitle: candidate.currentTitle, professionalSummary: candidate.professionalSummary, skills: candidate.skills, workExperience: candidate.workExperience, education: candidate.education, certifications: candidate.certifications, languages: candidate.languages, links: candidate.links }; }
function lines(value: string) { return value.split(/\r?\n/gu).map((item) => item.trim()).filter(Boolean); }
function fieldLabel(value: string) { return value.replace(/([A-Z])/gu, " $1").replace(/^./u, (letter) => letter.toUpperCase()); }
function CenteredState(props: { title: string; icon: React.ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-slate-100"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 [&_svg]:size-6">{props.icon}</span><p className="mt-4 font-bold">{props.title}</p><Button asChild variant="outline" className="mt-4"><Link href="/resumes">Back to Resume Library</Link></Button></div></main>; }
