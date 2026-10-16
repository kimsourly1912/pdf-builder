"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ApplicationDocuments } from "./application-documents";
import { InterviewDetail } from "@/features/interviews/interview-detail";
import { applicationTask } from "./tasks";
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
  link_preparation: "Link existing preparation",
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
            ? `${app.jobTitle} · ${app.email} · ${version?.name ?? "Hiring pipeline"}`
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
        <p role="status">Loading application…</p>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{stage?.name ?? app.stageId}</Badge>
              <Badge variant="outline">
                {app.outcome ?? (app.hold ? "On hold" : "Active")}
              </Badge>
              <Badge variant="outline">
                Pipeline version {version?.version}
              </Badge>
              {app.offer !== "none" && (
                <Badge variant="secondary">Offer {app.offer}</Badge>
              )}
            </div>
            {app.hold && <p className="text-sm">On hold: {app.hold}</p>}
            <div className="flex flex-wrap gap-2">
              {!app.outcome && !app.hold && (
                <>
                  <Button onClick={primaryTask}>
                    {task?.label ?? "Review application"}
                  </Button>
                  <Button variant="outline" onClick={() => setMoving(true)}>
                    Move to…
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void openAction("assign_job")}
                  >
                    Assign job
                  </Button>
                </>
              )}
              {app.outcome ? (
                <Button
                  variant="outline"
                  onClick={() => void openAction("reopen")}
                >
                  Reopen
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void openAction(app.hold ? "resume" : "hold")
                    }
                  >
                    {app.hold ? "Resume" : "Put on hold"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void openAction("close")}
                  >
                    Close application
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Stage entry:{" "}
              {app.stageEnteredAt ? runDate(app.stageEnteredAt) : "unknown"}.
              Moving stages does not approve documents, send messages or make a
              hiring decision.
            </p>
          </section>
          <p className="text-sm text-muted-foreground">
            {task?.description} · Selected CV: {app.fileName}
          </p>
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
              <section className="space-y-4 rounded-xl border p-5">
                <h2 className="font-semibold">Application evidence</h2>
                <p className="text-sm">CV: {app.fileName}</p>
                <p className="text-sm">
                  Required documents: {data.facts.documentCounts.submitted}/
                  {data.facts.documentCounts.required} submitted ·{" "}
                  {data.facts.documentCounts.accepted}/
                  {data.facts.documentCounts.required} accepted
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!!app.outcome || !!app.hold}
                    onClick={() => void openAction("change_cv")}
                  >
                    Use another approved CV
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => changeTab("documents")}
                  >
                    Review this CV
                  </Button>

                  <Button
                    variant="outline"
                    disabled={!!app.outcome || !!app.hold}
                    onClick={() => void openAction("link_preparation")}
                  >
                    Link existing preparation
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Form requirements use assignments explicitly linked to this
                  application. Another job application&apos;s forms and
                  interview results do not satisfy them automatically.
                </p>
                <ul className="space-y-3 text-sm">
                  {Object.entries(REQUIREMENTS).map(([key, label]) => (
                    <li
                      key={key}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span>{label}</span>
                      <Badge
                        variant={
                          data.facts[key as keyof typeof REQUIREMENTS]
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {data.facts[key as keyof typeof REQUIREMENTS]
                          ? "Recorded"
                          : "Pending / not linked"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="space-y-3 rounded-xl border p-5">
                <h2 className="font-semibold">Current stage requirements</h2>
                <p className="text-sm">
                  Before entering:{" "}
                  {stage?.entry.map((r) => REQUIREMENTS[r]).join("; ") ||
                    "No additional requirements"}
                </p>
                <p className="text-sm">
                  Before leaving:{" "}
                  {stage?.exit.map((r) => REQUIREMENTS[r]).join("; ") ||
                    "No additional requirements"}
                </p>
                {stage?.activity === "interview" && (
                  <p className="text-xs text-muted-foreground">
                    Starting interviews always requires a current HR-approved
                    CV. This hiring model can add document requirements before
                    interviews.
                  </p>
                )}
              </section>
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
                  <p className="text-sm">
                    Start interviews from an interview activity stage after
                    approving the current CV and satisfying its entry
                    requirements.
                  </p>
                  <Button
                    disabled={
                      busy ||
                      !!app.hold ||
                      !!app.outcome ||
                      !data.facts.cv_approved ||
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
                  <Label htmlFor="application-reason">Reason</Label>
                  <Input
                    id="application-reason"
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
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
