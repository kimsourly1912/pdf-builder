"use client";
import { CandidateRunProgress } from "@/features/hr/candidate-run-progress";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import { ResumeDetailView } from "@/features/resumes/resume-detail";
import { DISCARD_EDITS } from "@/features/resumes/use-unsaved-changes";
import {
  candidateWork,
  candidateJourney,
} from "@/features/hr/candidate-journey";
import { CandidateForms } from "@/features/hr/candidate-forms";
import {
  CandidatePreparation,
  ConfirmCandidateContact,
} from "@/features/hr/candidate-preparation";
import {
  STAGE_LABELS,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
import {
  stageAge,
  statusColor,
  runStatusLabel,
  candidateCvPreview,
} from "./presentation";
import { candidateNextAction } from "./submission-progress";
import { CvUpdatePanel } from "./cv-update-panel";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import {
} from "./stage-evidence";
import { MoveMenu, MoveDialog } from "./progress-actions";
const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "CV & documents" },
  { id: "forms", label: "Forms" },
  { id: "communication", label: "Communication" },
  { id: "history", label: "History" },
];
export function ProgressDetail({
  displayName,
  candidateId,
}: {
  displayName: string;
  candidateId: string;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const requested = search.get("tab"),
    tab = PROFILE_TABS.some((t) => t.id === requested)
      ? requested!
      : "overview";
  const [item, setItem] = useState<CandidateProgress | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [previewId, setPreviewId] = useState<string | null>(() => search.get("cv")),
    [reviewingUpdate, setReviewingUpdate] = useState(false),
    [move, setMove] = useState<{
      item: CandidateProgress;
      stage: CandidateStage;
    } | null>(null);
  const requestVersion = useRef(0);
  const invalidate = useCallback(() => ++requestVersion.current, []);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const data = await workflowApi<{ candidate: CandidateProgress }>(
        `/api/candidates/${candidateId}`,
      );
      if (version === requestVersion.current) {
        setItem(data.candidate);
        setError("");
      }
    } catch (e) {
      if (version === requestVersion.current) {
        setError(errorText(e));
        if (errorText(e).includes("active CV not found")) setItem(null);
      }
    }
  }, [candidateId]);
  useEffect(() => {
    const initial = setTimeout(() => {
      if (!busy && !move) void load();
    }, 0);
    const refresh = () => {
      if (!document.hidden && !busy && !move) void load();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      invalidate();
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, busy, move, invalidate]);
  function leaveDraft() {
    if (dirty && !window.confirm(DISCARD_EDITS)) return false;
    setDirty(false);
    return true;
  }
  function changeTab(value: string) {
    if (value === tab || !leaveDraft()) return;
    setReviewingUpdate(false);
    router.replace(`/candidates/${candidateId}?tab=${value}`, {
      scroll: false,
    });
  }
  async function startReview() {
    if (!item || busy) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "start_review",
          expectedRevision: item.revision,
        }),
      });
      await load();
      changeTab("documents");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function select(action: "select_cv" | "select_run", value: string) {
    if (!item || !leaveDraft()) return;
    if (
      action === "select_cv" &&
      value !== item.selectedCv.id &&
      !window.confirm(
        `Use ${item.cvs.find((c) => c.id === value)?.fileName ?? "this CV"} for a new preparation? Progress will track this CV. Previous approval, account access, assigned forms and answers remain in history. This does not start a workflow or resend an invitation.`,
      )
    )
      return;
    ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const data = await workflowApi<{ candidate: CandidateProgress }>(
        `/api/candidates/${candidateId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            expectedRevision: item.revision,
            ...(action === "select_cv"
              ? { resumeId: value }
              : { runId: value }),
          }),
        },
      );
      ++requestVersion.current;
      setItem(data.candidate);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const viewingCv = item ? candidateCvPreview(item, previewId) : null;
  function nextAction() {
    if (!item) return null;
    if (!item.selectedCv.verified)
      return !item.facts.reviewStarted &&
        item.facts.runStatus !== "waiting_review" ? (
        <Button disabled={busy} onClick={() => void startReview()}>
          Start CV review
        </Button>
      ) : (
        <Button
          onClick={() => {
            setPreviewId(null);
            changeTab("documents");
            if (tab === "documents")
              document.getElementById("selected-cv")?.focus();
          }}
        >
          Review and approve CV
        </Button>
      );
    const issue = item.issues[0];
    if (issue?.key === "contact" && item.selectedCv.intakeId)
      return (
        <ConfirmCandidateContact item={item} onChanged={() => void load()} />
      );
    if (issue?.key === "new_cv")
      return (
        <Button onClick={() => changeTab("documents")}>
          Review latest submission
        </Button>
      );
    if (issue && item.run && ["run_failed","telegram","telegram_retry","uncertain","multiple_runs"].includes(issue.key))
      return <Button onClick={()=>changeTab("overview")}>Resolve preparation</Button>;
    if (issue)
      return (
        <Button asChild>
          <Link href={issue.href}>{issue.action}</Link>
        </Button>
      );
    if (
      item.run &&
      ["queued", "running", "waiting_review", "failed"].includes(
        item.run.status,
      )
    )
      return (
        <Button onClick={() => {changeTab("overview");document.getElementById("candidate-preparation")?.scrollIntoView({behavior:"smooth"});}}>
          {candidateNextAction(item).next}
        </Button>
      );
    if (!item.facts.preparationCurrent)
      return item.accountCreated ? (
        <Button
          onClick={() => {
            changeTab("forms");
            if (tab === "forms")
              document
                .getElementById("assign-forms")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Assign forms
        </Button>
      ) : (
        <CandidatePreparation item={item} onChanged={() => void load()} />
      );
    return (
      <Button onClick={() => changeTab("forms")}>
        {item.automaticStage === "ready"
          ? "Review submitted forms"
          : item.automaticStage === "accepted"
            ? "View accepted documents"
            : "Check form completion"}
      </Button>
    );
  }
  return (
    <AppShell displayName={displayName}>
      <Link
        href="/candidates"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        All candidates
      </Link>
      <PageHeader
        title={item?.name ?? "Candidate profile"}
        description={
          item
            ? `${item.email}${item.telegram ? ` · @${item.telegram}` : ""}`
            : "Loading candidate…"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {item && (
              <MoveMenu
                item={item}
                disabled={busy}
                onMove={(i, s) => setMove({ item: i, stage: s })}
              />
            )}
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw />
              Refresh
            </Button>
          </div>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {error.includes("active CV not found") && (
              <Button asChild variant="outline" className="mt-3">
                <Link href="/archive">Open archive to restore a CV</Link>
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!item && !error && <p role="status">Loading candidate profile…</p>}
      {item && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={statusColor(STAGE_LABELS[item.automaticStage])}
            >
              {STAGE_LABELS[item.automaticStage]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {stageAge(item.stage, item.stageSince)}
            </span>
            {item.facts.assigned > 0 && <Badge variant="secondary">{item.facts.completed}/{item.facts.required} required forms submitted</Badge>}
          </div>
          <section
            aria-label="Candidate next step"
            className="rounded-xl border bg-card p-4 sm:p-5"
          >
            <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h2 className="font-semibold">
                  {candidateWork(item).owner === "Candidate"
                    ? "Waiting on candidate"
                    : candidateWork(item).owner === "Automation"
                      ? "Preparation in progress"
                      : candidateWork(item).owner === "Complete"
                        ? "Documents complete"
                        : "Your next action"}
                </h2>
                <p className="mt-1 max-w-3xl break-words text-sm text-muted-foreground">
                  {candidateWork(item).message}
                </p>

              </div>
              <div className="shrink-0 self-start">{tab === "documents" && !item.selectedCv.verified ? null : nextAction()}</div>
            </div>
            <details className="mt-4 border-t pt-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">Application milestones</summary>
            <ol
              aria-label="Candidate journey"
              className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6"
            >
              {candidateJourney(item).map((step) => (
                <li
                  key={step.label}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    aria-label={
                      step.done
                        ? "Complete"
                        : step.optional
                          ? "Optional"
                          : "Pending"
                    }
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${step.done ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {step.done ? "✓" : "·"}
                  </span>
                  <span>
                    {step.label}
                    {step.optional && !step.done ? " (if needed)" : ""}
                  </span>
                </li>
              ))}
            </ol>
            </details>
          </section>
          <Tabs value={tab} onValueChange={changeTab}>
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
              <TabsList variant="line" className="w-max">
                {PROFILE_TABS.filter(t=>["overview","documents","forms"].includes(t.id) || t.id===tab).map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm">More</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={()=>changeTab("communication")}>Communication</DropdownMenuItem><DropdownMenuItem onClick={()=>changeTab("history")}>Candidate history</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </div>
            <TabsContent value="overview" className="mt-5 space-y-5">
              <CandidateRunProgress item={item} onChanged={()=>void load()} />
              <Card><CardHeader><CardTitle>Candidate details</CardTitle></CardHeader><CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Email</dt><dd className="break-all">{item.email || "Not provided"}</dd></div>
                  <div><dt className="text-muted-foreground">Telegram</dt><dd>@{item.telegram || "Not connected"}{item.contactConfirmed ? " · Confirmed" : ""}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Current CV</dt><dd className="break-words">{item.selectedCv.fileName}</dd></div>
                </dl>
              </CardContent></Card>
              {(item.assignments ?? item.forms).length > 0 && <Card><CardHeader><CardTitle>Candidate forms</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{item.facts.completed}/{item.facts.required} required forms submitted · {item.facts.accepted ?? 0} accepted</p><Button variant="outline" className="mt-4" onClick={()=>changeTab("forms")}>View forms and responses</Button></CardContent></Card>}
              <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-medium">Application details & history</summary><div className="mt-4 space-y-4 text-sm">
                {item.manual && <p>HR override: {STAGE_LABELS[item.stage]} · Actual progress: {STAGE_LABELS[item.automaticStage]}</p>}
                <p>CV: {item.selectedCv.verified ? "Approved" : "Needs review"} · Account: {item.accountDisabled ? "Disabled" : item.accountCreated ? "Created / linked" : "Not created"}</p>
                {item.issues.slice(1).map(issue=><p key={issue.key}>{issue.message} <Link className="underline" href={issue.href}>{issue.action}</Link></p>)}
                {item.runs.filter(r=>r.resumeId===item.selectedCv.id && !r.archived).length > 1 && <><label htmlFor="selected-run">Preparation to track</label><Select value={item.run?.id ?? ""} onValueChange={v=>{if(v)void select("select_run",v);}} disabled={busy}><SelectTrigger id="selected-run" className="w-full min-w-0"><SelectValue /></SelectTrigger><SelectContent>{item.runs.filter(r=>r.resumeId===item.selectedCv.id && !r.archived).map(r=><SelectItem key={r.id} value={r.id}>{r.name} · {runStatusLabel(r.status,r.waitingFor)}</SelectItem>)}</SelectContent></Select></>}
                <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>changeTab("history")}>View candidate history</Button>{item.accountId && <Button asChild variant="outline"><Link href={`/accounts?${new URLSearchParams({account:item.accountId,search:item.accountEmail ?? item.email})}`}>Manage account access</Link></Button>}</div>
              </div></details>
            </TabsContent>
            <TabsContent value="documents" className="mt-5 space-y-5">
              {((item.cvUpdates?.length ?? 0) > 0 ||
                (item.currentCv &&
                  item.currentCv.id !== item.selectedCv.id)) && (
                <CvUpdatePanel
                  item={item}
                  onChanged={() => void load()}
                  onDirtyChange={setDirty}
                  canOpenReview={leaveDraft}
                  onReviewingChange={setReviewingUpdate}
                />
              )}
              {!reviewingUpdate && item.cvs.length > 1 && (
                <section className="rounded-xl border bg-card p-5">
                  <label htmlFor="selected-cv" className="text-sm font-medium">
                    Currently viewing CV
                  </label>
                  <Select
                    value={viewingCv?.id ?? item.selectedCv.id}
                    onValueChange={(v) => {
                      if (v && leaveDraft()) setPreviewId(v);
                    }}
                    disabled={busy}
                  >
                    <SelectTrigger
                      id="selected-cv"
                      aria-label="Selected candidate CV"
                      className="mt-2 w-full min-w-0"
                    >
                      <SelectValue className="min-w-0 flex-1 !block truncate text-left" />
                    </SelectTrigger>
                    <SelectContent>
                      {item.cvs.map((c) => (
                        <SelectItem
                          key={c.id}
                          value={c.id}
                          disabled={c.archived}
                        >
                          {c.fileName} ·{" "}
                          {item.cvs.find((cv) => !cv.archived)?.id === c.id
                            ? "Latest submission · "
                            : ""}
                          {c.archived
                            ? "Archived"
                            : c.verified
                              ? "Approved"
                              : "Needs review"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-3 break-words text-sm text-muted-foreground">
                    {viewingCv?.fileName} · Currently viewing
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Viewing a CV does not change the application CV or progress.
                    CV approval verifies information; it does not mark the
                    candidate as hired.
                  </p>
                </section>
              )}
              {!reviewingUpdate &&
                (viewingCv && viewingCv.id !== item.selectedCv.id ? (
                  <section className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Preview only. Current preparation uses{" "}
                      {item.selectedCv.fileName}.
                    </p>
                    <div className="h-[32rem]">
                      <ResumePdfPreview
                        resumeId={viewingCv.id}
                        fileName={viewingCv.fileName}
                        contained
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setPreviewId(null)}
                      >
                        Return to preparation CV
                      </Button>
                      <Button
                        disabled={busy || viewingCv.archived}
                        onClick={() => void select("select_cv", viewingCv.id)}
                      >
                        Use this CV for a new preparation
                      </Button>
                    </div>
                  </section>
                ) : (
                  <ResumeDetailView
                    key={item.selectedCv.id}
                    resumeId={item.selectedCv.id}
                    embedded
                    onChanged={() => void load()}
                    onDirtyChange={setDirty}
                    onApproved={()=>{setDirty(false);router.replace(`/candidates/${candidateId}?tab=overview`,{scroll:false});void load();}}
                  />
                ))}
            </TabsContent>
            <TabsContent value="forms" className="mt-5">
              <CandidateForms item={item} onChanged={() => void load()} />
            </TabsContent>
            <TabsContent value="communication" className="mt-5 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Contact & invitation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">
                        Email provided by candidate
                      </dt>
                      <dd className="break-all">
                        {item.email || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Telegram</dt>
                      <dd>
                        {item.telegram
                          ? `@${item.telegram}`
                          : item.selectedCv.intakeId
                            ? "Connected Telegram user"
                            : "Not connected"}
                        {item.selectedCv.intakeId
                          ? item.contactConfirmed
                            ? " · HR confirmed"
                            : " · Needs confirmation"
                          : ""}
                      </dd>
                    </div>
                  </dl>
                  {item.selectedCv.intakeId && !item.contactConfirmed && (
                    <ConfirmCandidateContact
                      item={item}
                      onChanged={() => void load()}
                    />
                  )}
                  <p className="text-sm text-muted-foreground">
                    Sent means Telegram accepted the message. It does not mean
                    the candidate read it. Uncertain delivery must be checked
                    before resending.
                  </p>
                  {(item.invitations ?? []).map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                    >
                      <span>
                        {d.status === "sent"
                          ? "Invitation sent"
                          : d.status === "uncertain"
                            ? "Delivery uncertain — check before resending"
                            : `Invitation ${d.status}`}
                      </span>
                      <span className="text-muted-foreground">
                        {runDate(d.at)}
                      </span>
                    </div>
                  ))}
                  {!item.invitations?.length && (
                    <p className="text-sm text-muted-foreground">
                      No invitation recorded for the selected preparation.
                    </p>
                  )}
                  {item.run && (
                    <Button asChild variant="outline">
                      <Link href={`/candidates/${candidateId}?tab=overview#candidate-preparation`}>View invitation progress</Link>
                    </Button>
                  )}
                  {item.selectedCv.intakeId && (
                    <Button asChild variant="outline">
                      <Link href={`/intake/${item.selectedCv.intakeId}`}>
                        Original intake details
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history" className="mt-5 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Candidate timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-5">
                    {item.activity.map((a) => (
                      <li key={a.id} className="flex gap-3">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.action}</p>
                          {typeof a.metadata.from === "string" &&
                            typeof a.metadata.to === "string" && (
                              <p className="text-xs">
                                {a.metadata.from} → {a.metadata.to}
                              </p>
                            )}
                          {typeof a.metadata.reason === "string" &&
                            a.metadata.reason && (
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                                {a.metadata.reason}
                              </p>
                            )}
                          <p className="break-words text-xs text-muted-foreground">
                            {a.actor} · {runDate(a.at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Preparation history
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.runs.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap justify-between gap-3 border-b pb-3 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {r.name}
                          {r.id === item.run?.id ? " · Current" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {runStatusLabel(r.status, r.waitingFor)}
                          {r.archived ? " · Archived" : ""} ·{" "}
                          {runDate(r.createdAt)}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/workflows/${r.workflowId}?tab=runs&run=${r.id}`}
                        >
                          View run
                        </Link>
                      </Button>
                    </div>
                  ))}
                  {!item.runs.length && (
                    <p className="text-sm text-muted-foreground">
                      No preparation has started.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
      <MoveDialog
        key={move ? `${move.item.id}:${move.stage}` : "closed"}
        move={move}
        onClose={() => setMove(null)}
        onChanged={() => void load()}
      />
    </AppShell>
  );
}
