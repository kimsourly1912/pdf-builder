"use client";
import { validCandidateEmail, type ApprovalPlan } from "./approval-plan";
import {
  archiveNotice,
  type ArchiveReceipt,
} from "@/features/archive/archive-notice";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  RefreshCw,
  Save,
  Archive,
  UserCheck,
} from "lucide-react";
import { useUnsavedChanges, DISCARD_EDITS } from "./use-unsaved-changes";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import type {
  ResumeCandidateSummary,
  ResumeDetail,
  ResumeExtractionFields,
} from "@/features/resumes/resume.types";

type CandidateDraft = Omit<ResumeCandidateSummary, "id" | "verificationStatus">;

export function ResumeDetailView(props: { resumeId: string; embedded?: boolean; hidePdfPreview?: boolean; onChanged?: () => void; onDirtyChange?: (dirty: boolean) => void; onApproved?: () => void }) {
  const editorId = useId();
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [draft, setDraft] = useState<CandidateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setArchiveOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false),
    [confirmTelegram, setConfirmTelegram] = useState(false);
  const [approval, setApproval] = useState<ApprovalPlan | null>(null);
  const [reuseAccount, setReuseAccount] = useState(false);
  const [decision, setDecision] = useState<"approve" | "save" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const dirty =
    !!draft &&
    !!resume?.candidate &&
    JSON.stringify(draft) !== JSON.stringify(candidateDraft(resume.candidate));
  useUnsavedChanges(dirty);
  const { onDirtyChange } = props;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const discardEdits = () => !dirty || window.confirm(DISCARD_EDITS);

  const loadResume = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        resume?: ResumeDetail;
        error?: string;
      };

      if (!response.ok || !payload.resume) {
        throw new Error(payload.error || "The resume could not be loaded.");
      }

      setResume(payload.resume);
      setConfirmTelegram(payload.resume.telegramContact?.confirmed ?? false);
      setDraft(
        payload.resume.candidate
          ? candidateDraft(payload.resume.candidate)
          : null,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The resume could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [props.resumeId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadResume(), 0);
    return () => window.clearTimeout(timer);
  }, [loadResume]);

  async function saveCandidate(approve = false, confirmed = false) {
    if (!draft) return;
    if (!confirmed && approve && !resume?.cvUpdate) {
      if (!validCandidateEmail(draft.email)) {setError("Enter a valid email address.");return;}
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`/api/resumes/${props.resumeId}/approval-preview`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:draft.email})});
        const payload = await response.json() as {plan?:ApprovalPlan;error?:string};
        if (!response.ok || !payload.plan) throw new Error(payload.error ?? "Could not check preparation setup.");
        setApproval(payload.plan);
        setConfirmTelegram(payload.plan.contact?.confirmed ?? false);
        setReuseAccount(payload.plan.existingAccount?.linked ?? false);
        setDecision("approve");
      } catch (cause) {setError(cause instanceof Error ? cause.message : "Could not check preparation setup.");}
      finally {setBusy(false);}
      return;
    }
    if (!confirmed && (approve || (resume?.verificationStatus === "verified" && !resume.cvUpdate))) {setDecision(approve ? "approve" : "save");return;}
    setDecision(null);
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: approve ? "approve_cv" : "save_changes",
          updateRevision: resume?.cvUpdate?.revision,
          confirmInvalidateApproval: !approve && confirmed,
          candidate: draft,
          confirmTelegram,
          approvalPlanRevision: approve && !resume?.cvUpdate ? approval?.revision : undefined,
          existingAccountId: approve && reuseAccount ? approval?.existingAccount?.id : undefined,
          resumeRevision: resume?.updatedAt,
          candidateRevision: resume?.candidateRevision,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(
          payload.error || "Candidate information could not be saved.",
        );
      }

      setNotice(
        approve
          ? resume?.cvUpdate ? "CV update approved. Existing preparation, account access and forms are unchanged. No workflow was started." : "CV approved. Published approval workflows may now start."
          : resume?.cvUpdate ? "Update draft saved. The current application is unchanged." : "Changes saved. This CV still needs approval; no workflow was started.",
      );
      await loadResume();
      props.onChanged?.();
      if (approve) props.onApproved?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Candidate information could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function linkDuplicate() {
    if (!resume?.duplicateCandidate || !discardEdits()) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/resumes/${props.resumeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_candidate",
          candidateId: resume.duplicateCandidate.id,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Candidate could not be linked.");
      }

      setNotice(
        "Resume linked to the existing candidate. Existing verified data was preserved.",
      );
      await loadResume();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Candidate could not be linked.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryExtraction() {
    if (!resume || !discardEdits()) return;
    setAiOpen(false);

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        resume.intakeId
          ? `/api/intake/${resume.intakeId}/extract`
          : `/api/resumes/${resume.id}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true, reextract: true }),
        },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Extraction could not be retried.");
      }

      setNotice("AI resume analysis completed.");
      await loadResume();
      props.onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Extraction could not be retried.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteResume() {
    if (!resume || !discardEdits()) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/archive/resume/${resume.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Resume could not be archived.");
      }

      const receipt = (await response.json()) as ArchiveReceipt;
      archiveNotice(
        "resume",
        resume.id,
        resume.fileName,
        receipt,
        () => { void loadResume(); props.onChanged?.(); },
      );
      setArchiveOpen(false);
      await loadResume();
      props.onChanged?.();
      setBusy(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Resume could not be archived.",
      );
      setBusy(false);
      setArchiveOpen(false);
    }
  }

  if (loading) {
    return (
      <CenteredState
        title="Opening resume…"
        icon={<LoaderCircle className="animate-spin" />}
      />
    );
  }

  if (!resume) {
    return (
      <CenteredState
        title={error || "Resume not found"}
        icon={<AlertTriangle />}
      />
    );
  }

  const fields = resume.extraction?.fields;

  return (
    <main className={props.embedded ? "min-w-0 text-foreground" : "min-h-screen bg-background text-foreground"}>
      {props.embedded && <details className="mb-4 rounded-lg border bg-card p-3"><summary className="cursor-pointer text-sm font-medium">CV tools</summary><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={()=>setAiOpen(true)}>Optional AI extraction</Button><Button variant="outline" size="sm" disabled={busy} onClick={()=>setArchiveOpen(true)}>Archive CV</Button></div></details>}
      {!props.embedded && <header className={props.embedded ? "rounded-lg border bg-card" : "sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur"}>
        <div className="mx-auto flex min-h-16 max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/resumes" aria-label="Back to CV library">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {resume.candidate?.fullName || resume.fileName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {resume.fileName} · Extraction v
                {resume.extractionVersion ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/resumes/${resume.id}/download`} download>
                <Download /> Download
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !!resume.cvUpdate && !["pending", "reviewing"].includes(resume.cvUpdate.status)}
              onClick={() => setAiOpen(true)}
            >
              <RefreshCw className={busy ? "animate-spin" : ""} />
              Optional AI extraction
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="text-destructive hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive /> Archive
            </Button>
          </div>
        </div>
      </header>}

      {!props.embedded && resume.candidate && <div className="mx-auto max-w-7xl px-4 pt-4"><Alert><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>This editor uses the same CV approval as the candidate profile. Follow overall progress and forms from the profile.</span><Button asChild variant="outline" size="sm"><Link href={`/candidates/${resume.candidate.id}?tab=documents`}>Open candidate profile</Link></Button></AlertDescription></Alert></div>}
      <div className={props.embedded ? "min-w-0 py-5" : "mx-auto max-w-[1500px] px-4 py-5 sm:px-6"}>
        {resume.archived && (
          <Alert className="mb-4">
            <Archive />
            <AlertDescription>
              This CV is archived. Use Undo archive when offered, or{" "}
              <Link href="/archive" className="underline">
                open Archive to restore it
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle />
            <AlertTitle>Resume action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {notice && !error && (
          <Alert
            className="mb-4 border-success/30 bg-success/10 text-success-foreground"
            role="status"
          >
            <CheckCircle2 />
            <AlertTitle>Completed</AlertTitle>
            <AlertDescription className="text-success-foreground/80">
              {notice}
            </AlertDescription>
          </Alert>
        )}

        {resume.duplicateCandidate && (
          <Alert
            variant="destructive"
            className="mb-4 grid-cols-[auto_1fr] gap-4 bg-destructive/5"
          >
            <AlertTriangle />
            <div className="min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <AlertTitle>Possible existing candidate</AlertTitle>
                  <AlertDescription className="mt-1">
                    Matched{" "}
                    {resume.duplicateCandidate.fullName ||
                      "an existing candidate"}{" "}
                    using email or phone. Review before linking; existing data
                    will not be overwritten.
                  </AlertDescription>
                </div>
                <Button
                  disabled={busy}
                  variant="destructive"
                  onClick={() => void linkDuplicate()}
                >
                  <UserCheck /> Link candidate
                </Button>
              </div>
              <DuplicateComparison
                existing={resume.duplicateCandidate}
                fields={fields}
              />
            </div>
          </Alert>
        )}

        <div className={props.hidePdfPreview ? "grid min-w-0 gap-5" : props.embedded ? "grid min-w-0 items-start gap-5 xl:grid-cols-2" : "grid items-start gap-5 xl:grid-cols-[minmax(500px,1fr)_minmax(430px,560px)]"}>
          {!props.hidePdfPreview && <Card className="gap-0 overflow-hidden py-0 xl:sticky xl:top-20">
            <ResumePdfPreview resumeId={resume.id} fileName={resume.fileName} />
          </Card>}

          <section className="space-y-4">
            <details className="rounded-lg border bg-card p-3">
              <summary className="cursor-pointer text-sm font-medium">CV source and processing details</summary>
              <div className="mt-3"><ResumeMeta resume={resume} /></div>
            </details>

            {draft ? (
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Candidate information</CardTitle>
                    <CardDescription>
                      Save changes to keep your review draft. Approve CV separately after checking the information.
                    </CardDescription>
                  </div>
                  {resume.verificationStatus === "verified" ? (
                    <Badge className="bg-success/10 text-success">
                      <CheckCircle2 /> CV approved
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      {resume.verificationStatus.replaceAll("_", " ")}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveCandidate();
                    }}
                  >
                    <fieldset disabled={busy || resume.archived || !!resume.cvUpdate && !["pending", "reviewing"].includes(resume.cvUpdate.status)}>
                      <p
                        role="status"
                        className="mb-4 text-sm text-muted-foreground"
                      >
                        {dirty ? "Unsaved changes" : "Saved"}
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField
                          label="Full name"
                          approvalRequired
                          inputId={`${editorId}-name`}
                          value={draft.fullName}
                          onChange={(value) =>
                            setDraft({ ...draft, fullName: value })
                          }
                          meta={fields?.fullName}
                        />
                        <TextField
                          label="Current title"
                          value={draft.currentTitle}
                          onChange={(value) =>
                            setDraft({ ...draft, currentTitle: value })
                          }
                          meta={fields?.currentTitle}
                        />
                        <TextField
                          label="Email"
                          approvalRequired
                          inputId={`${editorId}-email`}
                          type="email"
                          error={draft.email.trim() && !validCandidateEmail(draft.email) ? "Enter a valid email address." : undefined}
                          value={draft.email}
                          onChange={(value) =>
                            setDraft({ ...draft, email: value })
                          }
                          meta={fields?.emails}
                        />
                        <TextField
                          label="Phone"
                          value={draft.phone}
                          onChange={(value) =>
                            setDraft({ ...draft, phone: value })
                          }
                          meta={fields?.phones}
                        />
                        <details className="sm:col-span-2 rounded-lg border p-3">
                          <summary className="cursor-pointer text-sm font-medium">Additional candidate information</summary>
                          <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <TextField
                          label="Date of birth"
                          date
                          value={draft.dateOfBirth ?? ""}
                          onChange={(value) =>
                            setDraft({ ...draft, dateOfBirth: value || null })
                          }
                          meta={fields?.dateOfBirth}
                        />
                        <TextField
                          label="Gender"
                          value={draft.gender}
                          onChange={(value) =>
                            setDraft({ ...draft, gender: value })
                          }
                          meta={fields?.gender}
                        />
                        <TextField
                          label="Nationality"
                          value={draft.nationality}
                          onChange={(value) =>
                            setDraft({ ...draft, nationality: value })
                          }
                          meta={fields?.nationality}
                        />
                        <div className="sm:col-span-2">
                          <TextField
                            label="Address"
                            value={draft.address}
                            onChange={(value) =>
                              setDraft({ ...draft, address: value })
                            }
                            meta={fields?.address}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <TextAreaField
                            label="Professional summary"
                            value={draft.professionalSummary}
                            onChange={(value) =>
                              setDraft({
                                ...draft,
                                professionalSummary: value,
                              })
                            }
                            meta={fields?.professionalSummary}
                          />
                        </div>
                        {(
                          [
                            "skills",
                            "workExperience",
                            "education",
                            "certifications",
                            "languages",
                            "links",
                          ] as const
                        ).map((key) => (
                          <TextAreaField
                            key={key}
                            label={fieldLabel(key)}
                            value={draft[key].join("\n")}
                            onChange={(value) =>
                              setDraft({ ...draft, [key]: lines(value) })
                            }
                            meta={fields?.[key]}
                          />
                        ))}
                          </div>
                        </details>
                      </div>
                      {resume.telegramContact?.confirmed && <p className="mt-5 text-sm text-muted-foreground">Telegram contact confirmed · @{resume.telegramContact.username || "connected user"}</p>}
                      <p className="mt-3 text-sm text-muted-foreground">{resume.cvUpdate ? "This update has a separate information draft. Approving makes it the current CV while preserving the existing preparation snapshot, account, forms and answers. No workflow starts automatically." : <>Save changes keeps unfinished work. <strong>Approving may start your published workflow.</strong> You’ll review the preparation summary first.</>}</p>
                      {(!draft.fullName.trim() || !draft.email.trim()) && (
                        <p id={`${editorId}-approval-requirements`} className="mt-3 text-sm text-warning-foreground" role="status">
                          To approve this CV, add {[
                            !draft.fullName.trim() && "the candidate’s full name",
                            !draft.email.trim() && "their email address",
                          ].filter(Boolean).join(" and ")}. You can save unfinished changes first.
                          <Button type="button" variant="link" size="sm" className="h-auto px-1" onClick={() => document.getElementById(`${editorId}-${!draft.fullName.trim() ? "name" : "email"}`)?.focus()}>
                            {!draft.fullName.trim() ? "Add full name" : "Add email"}
                          </Button>
                        </p>
                      )}
                      {resume.archived && <p className="mt-3 text-sm text-muted-foreground">Restore this CV from Archive before approving.</p>}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={busy || resume.archived}
                        className="w-full"
                      >
                        {busy ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Save />
                        )}
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        aria-describedby={!draft.fullName.trim() || !draft.email.trim() ? `${editorId}-approval-requirements` : undefined}
                        className="w-full"
                        disabled={
                          busy ||
                          resume.archived ||
                          !draft.fullName.trim() ||
                          !validCandidateEmail(draft.email)
                        }
                        onClick={() => void saveCandidate(true)}
                      >
                        <UserCheck />
                        {resume.cvUpdate ? "Approve updated CV" : "Approve CV"}
                      </Button>
                      </div>
                    </fieldset>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Alert className="border-warning/30 bg-warning/10 text-warning-foreground">
                <AlertTriangle />
                <AlertTitle>Candidate profile needs attention</AlertTitle>
                <AlertDescription className="text-warning-foreground/80">
                  No new profile was created because extraction failed or this
                  resume may belong to an existing candidate. Retry extraction
                  or link the suggested candidate.
                </AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </div>

      <AlertDialog open={!!decision} onOpenChange={open => {if (!open && !busy) setDecision(null);}}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{decision === "save" ? "Save changes and require approval again?" : resume.cvUpdate ? "Approve this CV update?" : approval?.workflows.length ? "Approve CV and start preparation?" : "Approve this CV?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {decision === "save" ? "Existing preparation and answers stay preserved. This CV will need approval again." : resume.cvUpdate ? "This update becomes the current CV. Existing preparation and answers keep their original snapshot; no workflow or invitation repeats." : "Check the candidate, CV, and preparation below before approving."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="space-y-2 rounded-lg border p-3 text-sm">
            <div><dt className="text-muted-foreground">Candidate</dt><dd className="break-words font-medium">{draft?.fullName} · {draft?.email}</dd></div>
            <div><dt className="text-muted-foreground">CV</dt><dd className="break-words">{resume.fileName}</dd></div>
          </dl>
          {decision === "approve" && !resume.cvUpdate && approval && <>
            {approval.contact && (approval.contact.confirmed ? <p className="text-sm">✓ Telegram confirmed · @{approval.contact.username || "connected user"}</p> : <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmTelegram} onCheckedChange={v=>setConfirmTelegram(v===true)} /><span>I confirmed @{approval.contact.username || "connected user"} belongs to {draft?.fullName}.</span></label>)}
            {approval.workflows.length > 0 && approval.existingAccount && (approval.existingAccount.linked ? <p className="break-all text-sm">Using linked account: {approval.existingAccount.email}</p> : <label className="flex items-start gap-2 text-sm"><Checkbox checked={reuseAccount} onCheckedChange={v=>setReuseAccount(v===true)} /><span>Reuse existing candidate account: {approval.existingAccount.email}</span></label>)}
            {approval.workflows.length ? <div className="space-y-3 rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium">Preparation after approval</p>{approval.workflows.map(w=><div key={w.id}><p>{w.name} · v{w.version}{w.continuation ? " · Continue existing preparation" : ""}</p><p className="mt-1 text-muted-foreground">{w.forms.length ? `Forms: ${w.forms.map(f=>f.name).join(", ")}` : "No forms configured on this workflow."}</p>{w.sendsTelegram && <p className="mt-1 text-muted-foreground">{confirmTelegram ? "Send Telegram invitation after forms are prepared." : "Invitation waits until the Telegram contact is confirmed."}</p>}</div>)}<p className="text-xs text-muted-foreground">Review gates and conditions decide which steps run. Existing preparation is not duplicated.</p></div> : <p className="text-sm text-muted-foreground">CV approval will be saved. No preparation workflow starts automatically. You can choose a published workflow from this candidate’s workspace afterwards.</p>}
          </>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button disabled={busy || (decision === "approve" && !!approval?.workflows.length && !!approval?.existingAccount && !reuseAccount && !approval.existingAccount.linked)} onClick={() => void saveCandidate(decision === "approve", true)}>{busy ? "Saving…" : decision === "save" ? "Save and require approval" : resume.cvUpdate ? "Approve updated CV" : approval?.workflows.length ? "Approve & prepare" : "Approve CV"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!props.embedded && resume.candidate && (
        <Button asChild variant="outline">
          <Link href={`/candidates/${resume.candidate.id}`}>
            Return to candidate profile
          </Link>
        </Button>
      )}
      {!props.embedded && resume.intakeId && (
        <Button asChild variant="outline">
          <Link href={`/intake/${resume.intakeId}`}>
            Back to intake overview
          </Link>
        </Button>
      )}
      <AlertDialog open={aiOpen} onOpenChange={setAiOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extract this CV with AI?</AlertDialogTitle>
            <AlertDialogDescription>
              This uses paid AI processing. You can enter and verify candidate
              details manually instead. Extracting an already reviewed CV
              replaces its data and requires a new review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || resume.archived}
              onClick={() => void retryExtraction()}
            >
              Confirm paid extraction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Archive />
            </AlertDialogMedia>
            <AlertDialogTitle>Archive this resume?</AlertDialogTitle>
            <AlertDialogDescription>
              The CV and linked intake will be hidden from active lists. The PDF
              and history remain stored and can be restored from Archive. Active
              runs using this CV pause and need an explicit retry after
              restoration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void deleteResume()}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Archive />}
              Archive resume
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function DuplicateComparison(props: {
  existing: ResumeCandidateSummary;
  fields: ResumeExtractionFields | undefined;
}) {
  const rows = [
    [
      "Name",
      props.fields?.fullName.value ?? "—",
      props.existing.fullName || "—",
    ],
    [
      "Email",
      props.fields?.emails.value?.[0] ?? "—",
      props.existing.email || "—",
    ],
    [
      "Phone",
      props.fields?.phones.value?.[0] ?? "—",
      props.existing.phone || "—",
    ],
    [
      "Position",
      props.fields?.currentTitle.value ?? "—",
      props.existing.currentTitle || "—",
    ],
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-destructive/20 bg-card text-card-foreground">
      <Table>
        <TableHeader className="bg-destructive/5">
          <TableRow className="border-destructive/10 hover:bg-transparent">
            <TableHead>Field</TableHead>
            <TableHead>Extracted PDF</TableHead>
            <TableHead>Existing candidate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, extracted, existing]) => (
            <TableRow key={label} className="border-destructive/10">
              <TableCell className="font-medium">{label}</TableCell>
              <TableCell className="whitespace-normal">{extracted}</TableCell>
              <TableCell className="whitespace-normal">{existing}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ResumeMeta(props: { resume: ResumeDetail }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="size-5" />
        </span>
        <div>
          <CardTitle>Resume intake</CardTitle>
          <CardDescription>Original PDF and processing state</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Meta label="Extraction" value={props.resume.extractionStatus} />
          <Meta
            label="Resume verification"
            value={props.resume.verificationStatus.replaceAll("_", " ")}
          />
          <Meta label="Pages" value={String(props.resume.pageCount)} />
          <Meta
            label="Source"
            value={props.resume.source.replaceAll("_", " ")}
          />
          <Meta label="Received" value={props.resume.receivedDate} />
          <Meta
            label="Applied position"
            value={props.resume.appliedPosition || "—"}
          />
          <Meta
            label="File size"
            value={`${(props.resume.fileSize / 1024 / 1024).toFixed(1)} MB`}
          />
        </dl>

        {props.resume.note && (
          <p className="mt-4 rounded-lg bg-muted p-3 text-sm leading-6 text-muted-foreground">
            {props.resume.note}
          </p>
        )}
        {props.resume.errorMessage && (
          <p className="mt-3 text-xs font-medium text-destructive">
            {props.resume.errorMessage}
          </p>
        )}
        {props.resume.extraction &&
          props.resume.extraction.scannedPageCount > 0 && (
            <p className="mt-3 text-xs text-warning-foreground">
              {props.resume.extraction.scannedPageCount} page(s) had little or
              no selectable text. Review those pages manually.
            </p>
          )}
      </CardContent>
    </Card>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </dt>
      <dd className="mt-1 capitalize">{props.value}</dd>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  type?: "email";
  date?: boolean;
  approvalRequired?: boolean;
  inputId?: string;
  error?: string;
  onChange: (value: string) => void;
  meta?: ResumeExtractionFields[keyof ResumeExtractionFields];
}) {
  const generatedId = useId();
  const id = props.inputId ?? generatedId;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{props.label}{props.approvalRequired && <span className="text-xs font-normal text-muted-foreground"> · Required to approve</span>}</Label>
      {props.date ? (
        <DatePicker
          id={id}
          value={props.value}
          onValueChange={props.onChange}
          placeholder="Pick a date"
          aria-label={props.label}
        />
      ) : (
        <Input
          id={id}
          aria-label={props.label}
          aria-invalid={!!props.error}
          aria-describedby={props.error ? `${id}-error` : undefined}
          type={props.type ?? "text"}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{props.error}</p>}
      <Confidence meta={props.meta} />
    </div>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  meta?: ResumeExtractionFields[keyof ResumeExtractionFields];
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{props.label}</Label>
      <Textarea
        id={id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        rows={4}
        className="resize-y"
      />
      <Confidence meta={props.meta} />
    </div>
  );
}

function Confidence(props: {
  meta?: ResumeExtractionFields[keyof ResumeExtractionFields];
}) {
  if (!props.meta) return null;

  return (
    <span className="block text-[10px] text-muted-foreground">
      {props.meta.verification === "verified"
        ? "Verified by HR"
        : `Extracted · ${Math.round(props.meta.confidence * 100)}% confidence${
            props.meta.sourcePage ? ` · page ${props.meta.sourcePage}` : ""
          }`}
    </span>
  );
}

function candidateDraft(candidate: ResumeCandidateSummary): CandidateDraft {
  return {
    fullName: candidate.fullName,
    email: candidate.email,
    phone: candidate.phone,
    address: candidate.address,
    dateOfBirth: candidate.dateOfBirth,
    gender: candidate.gender,
    nationality: candidate.nationality,
    currentTitle: candidate.currentTitle,
    professionalSummary: candidate.professionalSummary,
    skills: candidate.skills,
    workExperience: candidate.workExperience,
    education: candidate.education,
    certifications: candidate.certifications,
    languages: candidate.languages,
    links: candidate.links,
  };
}

function lines(value: string) {
  return value
    .split(/\r?\n/gu)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldLabel(value: string) {
  return value
    .replace(/([A-Z])/gu, " $1")
    .replace(/^./u, (letter) => letter.toUpperCase());
}

function CenteredState(props: { title: string; icon: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardContent className="pt-1">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-6">
            {props.icon}
          </span>
          <p className="mt-4 font-semibold">{props.title}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/resumes">Back to Resume Library</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
