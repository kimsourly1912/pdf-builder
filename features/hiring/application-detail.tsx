"use client";
import { ArchiveButton } from "@/features/archive/archive-button";
import { DeleteButton } from "@/features/archive/delete-button";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApplicationDocuments } from "./application-documents";
import { InterviewDetail } from "@/features/interviews/interview-detail";
import { applicationTask } from "./tasks";
import { ApplicationChecklist } from "./application-checklist";
import { DISCARD_EDITS } from "@/features/resumes/use-unsaved-changes";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import type { CandidateProgress } from "@/features/candidate-progress/progress";
import {
  REQUIREMENTS,
  type HiringApplication,
  type ApplicationEvent,
} from "./hiring";
import { useHiringConfiguration } from "./client";
import { MoveApplication } from "./hiring-board";
type Detail = {
  application: HiringApplication;
  facts: Record<keyof typeof REQUIREMENTS, boolean> & {
    documentCounts: { required: number; submitted: number; accepted: number };
  };
  events: (ApplicationEvent & {
    labels: {
      stageLabel?: string;
      fromStageLabel?: string;
      outcome?: string;
      offer?: string;
      fileName?: string;
      previousCvName?: string;
    };
  })[];
  executions: {
    id: string;
    workflowId: string;
    name: string;
    status: string;
    archived: number;
    error: string | null;
    createdAt: string;
  }[];
};
const actionTitles = {
  assign_job: "Assign or change job",
  hold: "Put application on hold",
  resume: "Resume application",
  close: "Close application",
  reopen: "Reopen application",
  offer: "Record offer progress",
  link_preparation: "Reuse existing account & forms",
  change_cv: "Use another approved CV",
};
type Action = keyof typeof actionTitles;
export function ApplicationDetail({
  displayName,
  id,
}: {
  displayName: string;
  id: string;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const dirty = useRef(false);
  const rawTab = search.get("tab") ?? "overview";
  const tab = ["documents", "interviews", "offer", "activity"].includes(rawTab)
    ? rawTab
    : ["history", "automation"].includes(rawTab)
      ? "activity"
      : "overview";
  function changeTab(value: string) {
    if (value === tab) return;
    if (dirty.current && !window.confirm(DISCARD_EDITS)) return;
    dirty.current = false;
    router.push(`/hiring/${id}?tab=${value}`, { scroll: false });
  }
  const { config, error: configError } = useHiringConfiguration(),
    [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [moving, setMoving] = useState(false),
    [managingRecords, setManagingRecords] = useState(false),
    [action, setAction] = useState<Action | null>(null),
    [job, setJob] = useState(""),
    [stageId, setStageId] = useState(""),
    [reason, setReason] = useState(""),
    [outcome, setOutcome] = useState(""),
    [offer, setOffer] = useState(""),
    [preparation, setPreparation] = useState<CandidateProgress | null>(null),
    [confirmed, setConfirmed] = useState(false);
  const [cvs, setCvs] = useState<{ resumeId: string; fileName: string }[]>([]),
    [resumeId, setResumeId] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const reload = useCallback(async () => {
    try {
      setData(await workflowApi<Detail>(`/api/hiring/applications/${id}`));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0),
      interval = setInterval(() => void reload(), 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [reload]);
  const app = data?.application,
    version = config?.versions.find((v) => v.id === app?.pipelineVersionId),
    stage = version?.definition.stages.find((s) => s.id === app?.stageId),
    jobVersion = config?.versions.find(
      (v) => v.id === config.jobs.find((j) => j.id === job)?.pipelineVersionId,
    );
  const task =
    app && data
      ? applicationTask(
          app,
          stage,
          data.facts,
          data.executions.some((r) => r.status === "failed" && !r.archived),
        )
      : null;
  function primaryTask() {
    if (!task) return;
    if (task.action === "move") setMoving(true);
    else if (task.action) void openAction(task.action);
    else changeTab(task.tab);
  }
  async function openAction(value: Action) {
    setAction(value);
    setReason("");
    setOutcome("");
    setOffer("");
    setJob("");
    setStageId("");
    setConfirmed(false);
    setPreparation(null);
    setCvs([]);
    setResumeId("");
    setError("");
    requestId.current = crypto.randomUUID();
    if (value === "change_cv" && app) {
      try {
        const result = await workflowApi<{
          items: { resumeId: string; fileName: string }[];
        }>(`/api/hiring/candidates?candidate=${app.candidateId}`);
        setCvs(result.items.filter((c) => c.resumeId !== app.resumeId));
      } catch (e) {
        setError(errorText(e));
      }
    }
    if (value === "link_preparation" && app) {
      try {
        const result = await workflowApi<{ candidate: CandidateProgress }>(
          `/api/candidates/${app.candidateId}`,
        );
        setPreparation(result.candidate);
      } catch (e) {
        setError(errorText(e));
      }
    }
  }
  async function save() {
    if (!app || !action) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/hiring/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action,
          expectedRevision: app.revision,
          mutationId: requestId.current,
          reason,
          jobId: job,
          stageId,
          outcome,
          offer,
          resumeId,
          preparationRevision: preparation?.revision,
          confirmReuse: confirmed,
        }),
      });
      setAction(null);
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function startInterviews() {
    if (!app) return;
    setBusy(true);
    setError("");
    try {
      const result = await workflowApi<{ process: { id: string } }>(
        `/api/hiring/applications/${id}/interviews`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: app.revision,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      await reload();
      if (result.process.id) changeTab("interviews");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title={app?.name ?? "Application"}
        description={
          app
            ? `${app.jobTitle} · ${app.email}`
            : "Review this application's stage, documents and hiring progress."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/hiring">Back to hiring board</Link>
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void reload()}
            >
              Refresh
            </Button>
          </>
        }
      />
      {(error || configError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || configError}</AlertDescription>
        </Alert>
      )}
      {!app || !config || !data ? (
        <p
          role={error || configError ? undefined : "status"}
          className="text-sm text-muted-foreground"
        >
          {error || configError
            ? "Unable to load this application. Refresh to try again, or return to the hiring board."
            : "Loading application…"}
        </p>
      ) : (
        <>
          <section
            className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
            aria-label="Application status and next action"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Current stage
                </span>
                <Badge>{stage?.name ?? "Stage unavailable"}</Badge>
                <Badge variant="outline">
                  {app.outcome === "rejected"
                    ? "Not selected"
                    : app.outcome === "hired"
                      ? "Hired"
                      : app.outcome === "withdrawn"
                        ? "Withdrawn"
                        : app.hold
                          ? "On hold"
                          : "Active"}
                </Badge>
                {app.offer !== "none" && (
                  <Badge variant="secondary">Offer {app.offer}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!app.outcome && !app.hold && task?.action !== "move" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setMoving(true)}
                  >
                    Move stage
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={busy}>
                      <MoreHorizontal aria-hidden="true" />
                      More actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>Manage application</DropdownMenuLabel>
                    {!app.outcome &&
                      !app.hold &&
                      task?.action !== "assign_job" && (
                        <DropdownMenuItem
                          onSelect={() => void openAction("assign_job")}
                        >
                          {app.jobId ? "Change job" : "Assign job"}
                        </DropdownMenuItem>
                      )}
                    {app.outcome ? (
                      <DropdownMenuItem
                        onSelect={() => void openAction("reopen")}
                      >
                        Reopen application
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {task?.action !== "resume" && (
                          <DropdownMenuItem
                            onSelect={() =>
                              void openAction(app.hold ? "resume" : "hold")
                            }
                          >
                            {app.hold
                              ? "Resume application"
                              : "Put application on hold"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={() => void openAction("close")}
                        >
                          Record hiring decision / close
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setManagingRecords(true)}>
                      Archive or delete application…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-lg bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {app.outcome
                    ? "Application closed"
                    : app.hold
                      ? "Application on hold"
                      : "Next action"}
                </p>
                <h2 className="font-semibold">
                  {task?.label ?? "Review application"}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {task?.description}
                </p>
              </div>
              <Button
                className="w-full shrink-0 sm:w-auto"
                disabled={busy || !task}
                onClick={primaryTask}
              >
                {task?.label ?? "Review application"}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </section>
          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList className="flex w-full flex-wrap justify-start gap-2 group-data-[orientation=horizontal]/tabs:h-auto sm:w-fit">
              <TabsTrigger className="h-9 flex-none" value="overview">
                Overview
              </TabsTrigger>
              <TabsTrigger className="h-9 flex-none" value="documents">
                CV & documents
              </TabsTrigger>
              <TabsTrigger className="h-9 flex-none" value="interviews">
                Interviews
              </TabsTrigger>
              <TabsTrigger className="h-9 flex-none" value="offer">
                Offer & outcome
              </TabsTrigger>
              <TabsTrigger className="h-9 flex-none" value="activity">
                Activity
              </TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-5">
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <ApplicationChecklist
                  app={app}
                  stage={stage}
                  facts={data.facts}
                  onTab={changeTab}
                  onAssign={() => void openAction("assign_job")}
                />
                <section
                  className="min-w-0 space-y-4 rounded-xl border bg-card p-5"
                  aria-labelledby="application-details-title"
                >
                  <h2 id="application-details-title" className="font-semibold">
                    Application details
                  </h2>
                  <dl className="space-y-4 text-sm">
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">Selected CV</dt>
                      <dd className="break-words [overflow-wrap:anywhere]">
                        {app.fileName}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">
                        Required documents
                      </dt>
                      <dd>
                        {data.facts.documentCounts.required
                          ? `${data.facts.documentCounts.submitted} of ${data.facts.documentCounts.required} submitted · ${data.facts.documentCounts.accepted} accepted`
                          : "No required forms linked"}
                      </dd>
                    </div>
                    <div className="space-y-1">
                      <dt className="text-muted-foreground">
                        Entered current stage
                      </dt>
                      <dd>
                        {app.stageEnteredAt
                          ? runDate(app.stageEnteredAt)
                          : "Not recorded"}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => changeTab("documents")}
                  >
                    View CV & documents
                  </Button>
                  <details className="rounded-lg border px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      Pipeline & evidence options
                    </summary>
                    <div className="mt-4 space-y-4">
                      <p className="text-sm">
                        {version?.name ?? "Pipeline unavailable"}
                      </p>
                      {stage?.description && (
                        <p className="text-sm text-muted-foreground">
                          {stage.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!app.outcome || !!app.hold || busy}
                          onClick={() => void openAction("change_cv")}
                        >
                          Use another approved CV
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!app.outcome || !!app.hold || busy}
                          onClick={() => void openAction("link_preparation")}
                        >
                          Reuse existing account & forms
                        </Button>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Only forms explicitly linked to this application count
                        toward its requirements. Reusing preparation shares
                        those assignments and their review status.
                      </p>
                    </div>
                  </details>
                </section>
              </div>
            </TabsContent>
            <TabsContent value="documents" className="space-y-5">
              <ApplicationDocuments
                app={app}
                displayName={displayName}
                approved={data.facts.cv_approved}
                onChanged={() => void reload()}
                onDirtyChange={(value) => {
                  dirty.current = value;
                }}
              />
            </TabsContent>
            <TabsContent value="interviews" className="space-y-5">
              {app.interviewId ? (
                <InterviewDetail
                  processId={app.interviewId}
                  displayName={displayName}
                  embedded
                  readOnly={!!app.hold || !!app.outcome}
                  onChanged={() => void reload()}
                />
              ) : (
                <section className="space-y-4 rounded-xl border p-5">
                  <h2 className="font-semibold">Application interviews</h2>
                  <p className="text-sm text-muted-foreground">
                    Interviews need an assigned job, an approved CV and an
                    interview stage with its entry requirements satisfied.
                  </p>
                  {(app.hold || app.outcome) && (
                    <p className="text-sm">
                      {app.outcome ? "Reopen" : "Resume"} this application
                      before starting interviews.
                    </p>
                  )}
                  <ul
                    className="space-y-3 text-sm"
                    aria-label="Before starting interviews"
                  >
                    {!app.jobId && (
                      <li className="flex flex-wrap items-center justify-between gap-2">
                        <span>Assign a job to this application.</span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || !!app.hold || !!app.outcome}
                          onClick={() => void openAction("assign_job")}
                        >
                          Choose job
                        </Button>
                      </li>
                    )}
                    {!data.facts.cv_approved && (
                      <li className="flex flex-wrap items-center justify-between gap-2">
                        <span>The selected CV needs HR approval.</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => changeTab("documents")}
                        >
                          Review CV
                        </Button>
                      </li>
                    )}
                    {stage?.activity !== "interview" && (
                      <li className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          The current stage is not an interview stage.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || !!app.hold || !!app.outcome}
                          onClick={() => setMoving(true)}
                        >
                          Choose interview stage
                        </Button>
                      </li>
                    )}
                    {stage?.entry
                      .filter(
                        (key) => key !== "cv_approved" && !data.facts[key],
                      )
                      .map((key) => (
                        <li
                          key={key}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>Required to enter: {REQUIREMENTS[key]}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              changeTab(
                                key === "interview_complete"
                                  ? "overview"
                                  : "documents",
                              )
                            }
                          >
                            Review requirement
                          </Button>
                        </li>
                      ))}
                  </ul>
                  <Button
                    disabled={
                      busy ||
                      !!app.hold ||
                      !!app.outcome ||
                      !app.jobId ||
                      !data.facts.cv_approved ||
                      !!stage?.entry.some((key) => !data.facts[key]) ||
                      stage?.activity !== "interview"
                    }
                    onClick={() => void startInterviews()}
                  >
                    Start application interviews
                  </Button>
                </section>
              )}
            </TabsContent>
            <TabsContent value="offer" className="space-y-5">
              <section className="space-y-4 rounded-xl border p-5">
                <h2 className="font-semibold">Offer & hiring outcome</h2>
                <p className="text-sm">
                  Offer: {app.offer} · Outcome:{" "}
                  {app.outcome ?? "No hiring decision recorded"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Record offer progress and the explicit hiring decision
                  separately. Interview passed and accepted documents remain
                  supporting evidence.
                </p>
                <div className="flex flex-wrap gap-2">
                  {!app.outcome && !app.hold && (
                    <>
                      <Button onClick={() => void openAction("offer")}>
                        Record offer progress
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void openAction("close")}
                      >
                        Record hiring decision
                      </Button>
                    </>
                  )}
                  {app.outcome && (
                    <Button
                      variant="outline"
                      onClick={() => void openAction("reopen")}
                    >
                      Reopen application
                    </Button>
                  )}
                </div>
              </section>
            </TabsContent>
            <TabsContent value="activity" className="space-y-5">
              <h2 className="font-semibold">Application history</h2>
              <div className="space-y-3">
                {data.events.map((e) => (
                  <article
                    key={e.id}
                    className="space-y-2 rounded-lg border p-4 text-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>{e.kind.replaceAll("_", " ")}</strong>
                      <time>{runDate(e.at)}</time>
                    </div>
                    <p>
                      {e.labels.fromStageLabel ?? e.from ?? "Application"} →{" "}
                      {e.labels.stageLabel ?? e.to}
                    </p>
                    {e.kind === "application_closed" && e.labels.outcome && (
                      <p>
                        Outcome:{" "}
                        {e.labels.outcome === "rejected"
                          ? "Not selected"
                          : e.labels.outcome}
                      </p>
                    )}
                    {e.kind === "offer_recorded" && e.labels.offer && (
                      <p>Offer: {e.labels.offer}</p>
                    )}
                    {e.kind === "application_cv_selected" && (
                      <p>
                        CV: {e.labels.previousCvName} → {e.labels.fileName}
                      </p>
                    )}
                    {e.reason && (
                      <p className="whitespace-pre-wrap">{e.reason}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{e.actor}</p>
                  </article>
                ))}
                {!data.events.length && (
                  <p className="py-4 text-sm text-muted-foreground">
                    Imported preparation retains its earlier history on the
                    candidate profile.
                  </p>
                )}
              </div>
              <h2 className="font-semibold">Automation executions</h2>
              <Button variant="outline" asChild>
                <Link href="/workflows">Manage automation</Link>
              </Button>
              {data.executions.map((r) => (
                <article
                  key={r.id}
                  className="space-y-2 rounded-lg border p-4 text-sm"
                >
                  <p className="font-medium">
                    {r.name} · {r.status}
                    {r.archived ? " · Archived" : ""}
                  </p>
                  <p>{runDate(r.createdAt)}</p>
                  {r.error && <p className="text-destructive">{r.error}</p>}
                  <Button variant="link" asChild>
                    <Link
                      href={`/workflows/${r.workflowId}?tab=runs&run=${r.id}`}
                    >
                      View execution
                    </Link>
                  </Button>
                </article>
              ))}
              {!data.executions.length && (
                <p className="text-sm text-muted-foreground">
                  No recorded automation executions for this application.
                </p>
              )}
            </TabsContent>
          </Tabs>
          <Dialog open={managingRecords} onOpenChange={setManagingRecords}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Archive or delete application</DialogTitle>
                <DialogDescription>
                  {app.name} · {app.jobTitle}. Archive preserves this
                  application for restoration. Permanent deletion is available
                  only when its recorded history allows it.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                <ArchiveButton
                  type="hiring_application"
                  id={app.id}
                  label={`${app.name} — ${app.jobTitle}`}
                  disabled={busy}
                  onArchived={() => window.location.assign("/hiring")}
                />
                <DeleteButton
                  type="hiring_application"
                  id={app.id}
                  label={`${app.name} — ${app.jobTitle}`}
                  disabled={busy}
                  onDeleted={() => window.location.assign("/hiring")}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setManagingRecords(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {moving && (
            <MoveApplication
              app={app}
              initialTarget=""
              config={config}
              close={() => setMoving(false)}
              onDone={reload}
            />
          )}
          <Dialog
            open={!!action}
            onOpenChange={(open) => {
              if (!open && !busy) setAction(null);
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {action ? actionTitles[action] : "Update application"}
                </DialogTitle>
                <DialogDescription>
                  {app.name} · {app.jobTitle}. This records the decision and
                  preserves previous documents and history.
                </DialogDescription>
              </DialogHeader>
              <fieldset disabled={busy} className="space-y-4">
                {action === "assign_job" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="assign-job">Job opening</Label>
                      <SelectField
                        id="assign-job"
                        value={job}
                        onValueChange={(v) => {
                          setJob(v);
                          setStageId("");
                        }}
                        placeholder="Choose job"
                      >
                        {config.jobs
                          .filter((j) => !j.archived)
                          .map((j) => (
                            <SelectFieldOption key={j.id} value={j.id}>
                              {j.title}
                            </SelectFieldOption>
                          ))}
                      </SelectField>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assign-stage">
                        Map to destination stage
                      </Label>
                      <SelectField
                        id="assign-stage"
                        value={stageId}
                        onValueChange={setStageId}
                        placeholder="Choose destination stage"
                        disabled={!job}
                      >
                        {jobVersion?.definition.stages.map((s) => (
                          <SelectFieldOption key={s.id} value={s.id}>
                            {s.name}
                          </SelectFieldOption>
                        ))}
                      </SelectField>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Existing: {version?.name} / {stage?.name}. Destination:{" "}
                      {jobVersion?.name} /{" "}
                      {jobVersion?.definition.stages.find(
                        (s) => s.id === stageId,
                      )?.name ?? "choose stage"}
                      . Requirements are checked before reassignment.
                    </p>
                  </>
                )}
                {action === "change_cv" && (
                  <div className="space-y-4">
                    <p className="text-sm">
                      Current CV: {app.fileName}. Only a current HR-approved CV
                      can replace it for this application.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="application-approved-cv">
                        Replacement CV
                      </Label>
                      <SelectField
                        id="application-approved-cv"
                        value={resumeId}
                        onValueChange={setResumeId}
                        placeholder="Choose another CV"
                      >
                        {cvs.map((c) => (
                          <SelectFieldOption
                            key={c.resumeId}
                            value={c.resumeId}
                          >
                            {c.fileName}
                          </SelectFieldOption>
                        ))}
                      </SelectField>
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="keep-original-snapshots"
                        checked={confirmed}
                        onCheckedChange={(v) => setConfirmed(v === true)}
                      />
                      <Label
                        htmlFor="keep-original-snapshots"
                        className="leading-5"
                      >
                        Keep existing forms and interview documents on their
                        original snapshots. This selection sends no messages and
                        starts no automation.
                      </Label>
                    </div>
                  </div>
                )}
                {action === "close" && (
                  <div className="space-y-2">
                    <Label htmlFor="close-outcome">Hiring outcome</Label>
                    {app.nextAppointment && (
                      <p className="text-sm text-muted-foreground">
                        Resolve the recorded interview appointment in Interviews
                        before closing. Closing preserves the interview process
                        and its history.
                      </p>
                    )}
                    <SelectField
                      id="close-outcome"
                      value={outcome}
                      onValueChange={setOutcome}
                      placeholder="Choose an outcome"
                    >
                      <SelectFieldOption value="hired">
                        Hired · requires an accepted offer
                      </SelectFieldOption>
                      <SelectFieldOption value="rejected">
                        Not selected
                      </SelectFieldOption>
                      <SelectFieldOption value="withdrawn">
                        Candidate withdrawn
                      </SelectFieldOption>
                    </SelectField>
                  </div>
                )}
                {action === "offer" && (
                  <div className="space-y-2">
                    <Label htmlFor="offer-progress">Offer status</Label>
                    <SelectField
                      id="offer-progress"
                      value={offer}
                      onValueChange={setOffer}
                      placeholder="Choose offer status"
                    >
                      {["none", "draft", "sent", "accepted", "declined"].map(
                        (v) => (
                          <SelectFieldOption key={v} value={v}>
                            {v}
                          </SelectFieldOption>
                        ),
                      )}
                    </SelectField>
                  </div>
                )}
                {action === "link_preparation" && (
                  <div className="space-y-3">
                    {preparation ? (
                      <>
                        <p className="text-sm">
                          CV: {preparation.selectedCv.fileName}
                          <br />
                          Preparation: {preparation.run?.name ?? "Not prepared"}
                          <br />
                          {preparation.forms.length} form assignments
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {preparation.forms.map((f) => (
                            <li key={f.id}>
                              {f.name} · {f.status}
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id="reuse-preparation"
                            checked={confirmed}
                            onCheckedChange={(v) => setConfirmed(v === true)}
                          />
                          <Label
                            htmlFor="reuse-preparation"
                            className="leading-5"
                          >
                            Use these existing assignments for this application.
                            Their submissions will count toward this
                            application&apos;s requirements.
                          </Label>
                        </div>
                      </>
                    ) : (
                      <p role="status" className="text-sm">
                        Loading preparation preview…
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="application-reason">Reason (required)</Label>
                  <Input
                    id="application-reason"
                    aria-describedby="application-reason-help"
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <p
                    id="application-reason-help"
                    className="text-xs text-muted-foreground"
                  >
                    Enter at least 3 characters. This reason is saved in the
                    application history.
                  </p>
                </div>
                {action === "offer" && (
                  <p className="text-xs text-muted-foreground">
                    This records offer progress. It does not send an offer or
                    request a signature.
                  </p>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </fieldset>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setAction(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    busy ||
                    reason.trim().length < 3 ||
                    (action === "close" && !outcome) ||
                    (action === "offer" && !offer) ||
                    (action === "assign_job" && (!job || !stageId)) ||
                    (action === "link_preparation" && !confirmed) ||
                    (action === "change_cv" && (!confirmed || !resumeId))
                  }
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save application update"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </AppShell>
  );
}
