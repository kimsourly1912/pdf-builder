"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  ChevronDown,
  UserRound,
  FolderOpen,
  Settings2,
  Workflow,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ResumeDetailView } from "@/features/resumes/resume-detail";
import { WorkflowReview } from "@/features/workflows/workflow-review";
import { SubmissionReview, reviewLabel } from "@/features/hr/submission-review";
import { assignmentDisplay } from "@/features/accounts/assignment-status";
import {
  STATUS_COLORS,
  runStatusLabel,
  statusColor,
} from "@/features/candidate-progress/presentation";
import { RunTelegramAction } from "@/features/telegram/run-telegram-action";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { WorkflowRun } from "@/features/workflows/workflow";
import type { HiringApplication } from "./hiring";
type Preparation = {
  runUnavailable?: boolean;
  forms: {
    id: string;
    name: string;
    version: number;
    status: string;
    reviewStatus: string | null;
    submissionId: string | null;
    provenance: string;
  }[];
  run: WorkflowRun | null;
  account: { id: string; email: string; disabled: number } | null;
  overlaps: { id: string; name: string; status: string }[];
};
export function ApplicationDocuments({
  app,
  displayName,
  approved,
  onChanged,
  onDirtyChange,
}: {
  app: HiringApplication;
  displayName: string;
  approved: boolean;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<Preparation | null>(null),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [optionsError, setOptionsError] = useState(""),
    [optionsLoading, setOptionsLoading] = useState(true),
    [cvOpen, setCvOpen] = useState(!approved),
    [cvMounted, setCvMounted] = useState(!approved),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [workflowId, setWorkflowId] = useState(""),
    [templateId, setTemplateId] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [independent, setIndependent] = useState(false),
    [cutover, setCutover] = useState(false),
    [review, setReview] = useState<string | null>(null),
    [workflows, setWorkflows] = useState<
      {
        id: string;
        name: string;
        hasPreparation: boolean;
        active: boolean;
        trigger: string;
      }[]
    >([]),
    [templates, setTemplates] = useState<
      { id: string; name: string; versionId: string | null }[]
    >([]);
  const requestKey = useRef(crypto.randomUUID());
  const loadNumber = useRef(0);
  const optionsNumber = useRef(0);
  const reload = useCallback(async () => {
    const request = ++loadNumber.current;
    try {
      const result = await workflowApi<Preparation>(
        `/api/hiring/applications/${app.id}/preparation`,
      );
      if (request === loadNumber.current) {
        setData(result);
        setLoadError("");
      }
    } catch (e) {
      if (request === loadNumber.current) setLoadError(errorText(e));
    }
  }, [app.id]);
  const cancelLoads = useCallback(() => {
    loadNumber.current++;
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0),
      interval = setInterval(() => void reload(), 10000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
      cancelLoads();
    };
  }, [reload, app.revision, cancelLoads]);
  const loadOptions = useCallback(async () => {
    const request = ++optionsNumber.current;
    setOptionsLoading(true);
    setOptionsError("");
    const results = await Promise.allSettled([
      workflowApi<{ items: typeof workflows }>("/api/workflows"),
      (async () => {
        const all: typeof templates = [];
        for (let page = 1; page <= 100; page++) {
          const result = await workflowApi<{
            items: typeof templates;
            hasNextPage: boolean;
          }>(`/api/forms?page=${page}&pageSize=100`);
          all.push(...result.items);
          if (!result.hasNextPage) break;
        }
        return all;
      })(),
    ]);
    if (request !== optionsNumber.current) return;
    const [workflowResult, templateResult] = results;
    const errors: string[] = [];
    if (workflowResult.status === "fulfilled") {
      setWorkflows(
        workflowResult.value.items.filter(
          (w) =>
            w.active &&
            w.hasPreparation &&
            !w.trigger.startsWith("application") &&
            !w.trigger.startsWith("stage_"),
        ),
      );
    } else errors.push("Preparation workflows could not be loaded.");
    if (templateResult.status === "fulfilled") {
      setTemplates(templateResult.value.filter((f) => f.versionId));
    } else errors.push("Published forms could not be loaded.");
    setOptionsError(errors.join(" "));
    setOptionsLoading(false);
  }, []);
  const cancelOptions = useCallback(() => {
    optionsNumber.current++;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void loadOptions(), 0);
    return () => {
      clearTimeout(timer);
      cancelOptions();
    };
  }, [loadOptions, cancelOptions]);
  const changed = async () => {
    await reload();
    onChanged();
  };
  async function changeMode() {
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/hiring/applications/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "preparation_mode",
          expectedRevision: app.revision,
          mutationId: crypto.randomUUID(),
          mode:
            app.evidence.preparationMode === "application"
              ? "legacy"
              : "application",
          confirmCutover: cutover,
          reason:
            "HR selected the preparation automation ownership for this application.",
        }),
      });
      setCutover(false);
      await changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/hiring/applications/${app.id}/preparation`, {
        method: "POST",
        body: JSON.stringify({
          workflowId,
          expectedRevision: app.revision,
          confirmIndependent: confirmed,
          confirmLegacySeparation: independent,
        }),
      });
      setNotice(
        "Preparation started. Review its account, document and delivery choices below.",
      );
      await changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    if (!data?.account) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/accounts/${data.account.id}/assignments`, {
        method: "POST",
        headers: { "Idempotency-Key": requestKey.current },
        body: JSON.stringify({
          templateId,
          roleId: "form_user",
          applicationId: app.id,
          expectedApplicationRevision: app.revision,
        }),
      });
      requestKey.current = crypto.randomUUID();
      setTemplateId("");
      setNotice(
        "Required form assigned to this application. Share account access when ready.",
      );
      await changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    if (!data?.run) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/workflow-runs/${data.run.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "retry",
          expectedUpdatedAt: data.run.updatedAt,
        }),
      });
      await changed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const locked = !!app.outcome || !!app.hold;
  const accepted =
    data?.forms.filter((form) => form.reviewStatus === "accepted").length ?? 0;
  const awaitingReview =
    data?.forms.filter(
      (form) =>
        form.submissionId &&
        (!form.reviewStatus || form.reviewStatus === "pending"),
    ).length ?? 0;
  const runLabel = data?.run
    ? data.run.status === "waiting_review"
      ? "Needs review"
      : runStatusLabel(data.run.status)
    : "Not started";
  return (
    <div className="min-w-0 space-y-6">
      <Collapsible
        open={cvOpen}
        onOpenChange={(open) => {
          setCvOpen(open);
          if (open) setCvMounted(true);
        }}
        className="min-w-0 rounded-xl border bg-card shadow-xs"
      >
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="text-xs font-medium text-muted-foreground">
                  Selected CV
                </h2>
                <p className="break-words font-semibold [overflow-wrap:anywhere]">
                  {app.fileName}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  For {app.jobTitle}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  approved ? STATUS_COLORS.active : STATUS_COLORS.waiting
                }
              >
                {approved && (
                  <CheckCircle2 aria-hidden="true" className="size-3" />
                )}
                {approved ? "CV approved" : "CV review required"}
              </Badge>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm">
                  <ChevronDown
                    aria-hidden="true"
                    className={`transition-transform motion-reduce:transition-none ${cvOpen ? "rotate-180" : ""}`}
                  />
                  {cvOpen ? "Hide CV review" : "Review CV"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
              CV and profile edits may affect other applications. Submitted
              documents and interview history are preserved.
            </p>
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={`/candidates/${app.candidateId}?legacy=1&tab=documents#cv-updates`}
              >
                <UserRound /> Profile & CV updates <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </div>
        <CollapsibleContent
          forceMount
          className="min-w-0 border-t p-4 data-[state=closed]:hidden sm:p-5"
        >
          {cvMounted && (
            <fieldset disabled={locked} className="min-w-0">
              <ResumeDetailView
                resumeId={app.resumeId}
                embedded
                onChanged={onChanged}
                onApproved={onChanged}
                onDirtyChange={onDirtyChange}
              />
            </fieldset>
          )}
        </CollapsibleContent>
      </Collapsible>
      {locked && (
        <Alert>
          <AlertDescription>
            {app.outcome
              ? "This application is closed."
              : "This application is on hold."}{" "}
            Resume or reopen it to continue preparation and document tasks.
            Existing evidence is available to review.
          </AlertDescription>
        </Alert>
      )}
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>
            {loadError}{" "}
            <Button variant="link" onClick={() => void reload()}>
              Retry documents
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
          {notice}
        </p>
      )}
      {optionsError && (
        <Alert variant="destructive">
          <AlertDescription>
            {optionsError}{" "}
            <Button
              variant="link"
              disabled={optionsLoading}
              onClick={() => void loadOptions()}
            >
              Retry forms & workflows
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!data ? (
        !loadError && (
          <div role="status" className="grid gap-6 lg:grid-cols-2">
            <span className="sr-only">Loading application documents…</span>
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )
      ) : (
        <>
          {data.runUnavailable && (
            <Alert>
              <AlertDescription>
                The original preparation is archived or unavailable.{" "}
                <Link href="/archive" className="font-medium underline">
                  Review its retained records in Archive
                </Link>{" "}
                before preparing again.
              </AlertDescription>
            </Alert>
          )}
          {data.run && (
            <section
              aria-labelledby="preparation-progress-title"
              className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Workflow aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <h2
                      id="preparation-progress-title"
                      className="font-semibold"
                    >
                      Preparation progress
                    </h2>
                    <p className="break-words text-xs text-muted-foreground">
                      {data.run.workflowName} · version {data.run.version}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={statusColor(runLabel)}>
                  {runLabel}
                </Badge>
              </div>
              {data.run.errorMessage && (
                <p role="alert" className="text-sm text-destructive">
                  {data.run.errorMessage}
                </p>
              )}
              {data.run.status === "waiting_review" && !locked && (
                <WorkflowReview
                  key={data.run.id}
                  runId={data.run.id}
                  displayName={displayName}
                  embedded
                  onCompleted={() => void changed()}
                />
              )}
              {data.run.status !== "waiting_review" && (
                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {data.run.graph.nodes
                    .filter((node) =>
                      [
                        "create_account",
                        "link_resume",
                        "assign_forms",
                        "send_telegram",
                      ].includes(node.kind),
                    )
                    .map((node) => {
                      const step = data.run!.context.steps[node.id]?.status;
                      const label =
                        step === "completed"
                          ? "Completed"
                          : step === "failed"
                            ? "Failed"
                            : step === "waiting"
                              ? "Waiting"
                              : "Not started";
                      return (
                        <li
                          key={node.id}
                          className="space-y-2 rounded-lg border p-3"
                        >
                          <p className="text-xs font-medium">
                            {
                              (
                                {
                                  create_account: "Prepare account",
                                  link_resume: "Link approved CV",
                                  assign_forms: "Assign required forms",
                                  send_telegram: "Deliver invitation",
                                } as Record<string, string>
                              )[node.kind]
                            }
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              step === "waiting"
                                ? STATUS_COLORS.waiting
                                : statusColor(label)
                            }
                          >
                            {label}
                          </Badge>
                        </li>
                      );
                    })}
                </ol>
              )}
              {data.run.status === "failed" && !locked && (
                <Button disabled={busy} onClick={() => void retry()}>
                  <RefreshCw /> Retry failed step
                </Button>
              )}
              {!locked &&
                data.run.graph.nodes.some(
                  (node) => node.kind === "send_telegram",
                ) &&
                data.run.status !== "waiting_review" && (
                  <RunTelegramAction
                    run={data.run}
                    refreshKey={String(app.revision)}
                    onUpdated={() => void changed()}
                  />
                )}
            </section>
          )}
          <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section
              aria-labelledby="required-documents-title"
              className="min-w-0 space-y-5 rounded-xl border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 id="required-documents-title" className="font-semibold">
                    Required documents
                  </h2>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Forms and HR review for this application.
                  </p>
                </div>
                {data.forms.length > 0 && (
                  <Badge
                    variant="outline"
                    className={
                      accepted === data.forms.length
                        ? STATUS_COLORS.complete
                        : STATUS_COLORS.neutral
                    }
                  >
                    {accepted} of {data.forms.length} accepted
                  </Badge>
                )}
              </div>
              {awaitingReview > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {awaitingReview}{" "}
                  {awaitingReview === 1 ? "document is" : "documents are"} ready
                  for HR review.
                </p>
              )}
              <div className="space-y-3">
                {data.forms.map((form) => {
                  const label = form.submissionId
                    ? reviewLabel(form.reviewStatus ?? "pending")
                    : assignmentDisplay(form.status).detail;
                  const color =
                    form.reviewStatus === "accepted"
                      ? STATUS_COLORS.complete
                      : form.submissionId ||
                          form.status === "active" ||
                          form.status === "assigned"
                        ? STATUS_COLORS.waiting
                        : STATUS_COLORS.neutral;
                  return (
                    <article
                      key={form.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <FileText
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0 space-y-2">
                          <h3 className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                            {form.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={color}>
                              {label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Version {form.version}
                            </span>
                            {form.provenance !== "created" && (
                              <Badge variant="secondary">
                                Shared assignment
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {form.submissionId && (
                        <Button
                          variant={
                            form.reviewStatus === "accepted"
                              ? "outline"
                              : "default"
                          }
                          size="sm"
                          onClick={() => setReview(form.submissionId)}
                        >
                          {form.reviewStatus === "accepted"
                            ? "View submission"
                            : "Review submission"}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
              {!data.forms.length && (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-muted">
                    <FolderOpen
                      aria-hidden="true"
                      className="size-5 text-muted-foreground"
                    />
                  </span>
                  <div className="max-w-sm space-y-1">
                    <h3 className="text-sm font-medium">
                      No required documents yet
                    </h3>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {locked
                        ? "No forms are linked to this application."
                        : data.account && !data.account.disabled
                          ? "Assign a published form below to collect the documents needed for this application."
                          : "Prepare candidate access and forms using a published workflow. Assigned forms will appear here."}
                    </p>
                  </div>
                </div>
              )}
              {data.forms.some((form) => form.provenance !== "created") && (
                <p className="text-xs leading-5 text-muted-foreground">
                  Shared assignments keep the original submission and review
                  status. Changes affect each application using that assignment.
                </p>
              )}
              {data.account && !data.account.disabled && !locked && (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="application-form">
                      Add a required form
                    </Label>
                    <SelectField
                      id="application-form"
                      className="w-full"
                      disabled={busy || optionsLoading || !templates.length}
                      value={templateId}
                      onValueChange={(value) => {
                        setTemplateId(value);
                        requestKey.current = crypto.randomUUID();
                      }}
                      placeholder="Choose a published form"
                    >
                      {templates.map((template) => (
                        <SelectFieldOption
                          key={template.id}
                          value={template.id}
                        >
                          {template.name}
                        </SelectFieldOption>
                      ))}
                    </SelectField>
                  </div>
                  {optionsLoading ? (
                    <p role="status" className="text-xs text-muted-foreground">
                      Loading published forms…
                    </p>
                  ) : !templates.length && !optionsError ? (
                    <p className="text-xs text-muted-foreground">
                      No published forms are available.{" "}
                      <Link href="/forms" className="font-medium underline">
                        Create or publish a form
                      </Link>{" "}
                      to assign it here.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        !templateId || busy || !approved || optionsLoading
                      }
                      onClick={() => void assign()}
                    >
                      Assign required form
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Assignment makes the form available in the
                      candidate&apos;s account.
                    </p>
                  </div>
                  {!approved && (
                    <p className="text-xs text-muted-foreground">
                      Approve the selected CV before assigning forms.
                    </p>
                  )}
                </div>
              )}
            </section>
            <aside
              className="min-w-0 space-y-6"
              aria-label="Account and preparation"
            >
              <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <UserRound
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <h2 className="font-semibold">Candidate access</h2>
                </div>
                <div className="space-y-2">
                  <Badge
                    variant="outline"
                    className={
                      data.account
                        ? data.account.disabled
                          ? STATUS_COLORS.issue
                          : STATUS_COLORS.active
                        : STATUS_COLORS.neutral
                    }
                  >
                    {data.account
                      ? data.account.disabled
                        ? "Account disabled"
                        : "Account linked"
                      : "No account linked"}
                  </Badge>
                  {data.account ? (
                    <p className="break-words text-sm [overflow-wrap:anywhere]">
                      {data.account.email}
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Preparation links or creates the account used to complete
                      this application&apos;s forms.
                    </p>
                  )}
                </div>
                {data.account && !locked && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/accounts?account=${data.account.id}`}>
                      Manage account access <ArrowUpRight />
                    </Link>
                  </Button>
                )}
                {!!data.account?.disabled && (
                  <p className="text-xs text-muted-foreground">
                    Restore account access before assigning additional forms.
                  </p>
                )}
              </section>
              {!locked && (
                <details
                  className="group min-w-0 rounded-xl border bg-card p-4 sm:p-5"
                  open={!data.run && !data.forms.length}
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-2">
                      <Workflow
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      {data.run
                        ? "Prepare with another workflow"
                        : "Prepare account & forms"}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <fieldset disabled={busy} className="mt-4 min-w-0 space-y-4">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Choose a published workflow for this application. Account
                      reuse and invitation delivery keep their separate review
                      steps.
                    </p>
                    {data.overlaps.length > 0 && (
                      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs font-medium">
                          Existing candidate preparation
                        </p>
                        {data.overlaps.map((run) => (
                          <p
                            key={run.id}
                            className="break-words text-xs text-muted-foreground"
                          >
                            {run.name} · {runStatusLabel(run.status)}
                          </p>
                        ))}
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id="separate-preparation"
                            checked={independent}
                            onCheckedChange={(value) =>
                              setIndependent(value === true)
                            }
                          />
                          <Label
                            htmlFor="separate-preparation"
                            className="text-xs leading-5"
                          >
                            Create independent requirements for this
                            application. Existing assignments and invitations
                            remain retained. Active candidate preparation must
                            finish first.
                          </Label>
                        </div>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="application-preparation-workflow">
                        Preparation workflow
                      </Label>
                      <SelectField
                        id="application-preparation-workflow"
                        className="w-full"
                        disabled={busy || optionsLoading || !workflows.length}
                        value={workflowId}
                        onValueChange={setWorkflowId}
                        placeholder="Choose a published workflow"
                      >
                        {workflows.map((workflow) => (
                          <SelectFieldOption
                            key={workflow.id}
                            value={workflow.id}
                          >
                            {workflow.name}
                          </SelectFieldOption>
                        ))}
                      </SelectField>
                    </div>
                    {optionsLoading ? (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        Loading preparation workflows…
                      </p>
                    ) : !workflows.length && !optionsError ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        No published preparation workflow is available.{" "}
                        <Link
                          href="/workflows"
                          className="font-medium underline"
                        >
                          Manage automation
                        </Link>{" "}
                        to create and publish one.
                      </p>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="confirm-application-preparation"
                        checked={confirmed}
                        onCheckedChange={(value) =>
                          setConfirmed(value === true)
                        }
                      />
                      <Label
                        htmlFor="confirm-application-preparation"
                        className="text-xs leading-5"
                      >
                        Prepare this application using the selected workflow and
                        review its account, forms and invitation choices.
                      </Label>
                    </div>
                    <Button
                      className="w-full"
                      disabled={
                        busy ||
                        optionsLoading ||
                        !approved ||
                        !workflowId ||
                        !confirmed ||
                        (data.overlaps.length > 0 && !independent)
                      }
                      onClick={() => void start()}
                    >
                      {busy ? "Starting…" : "Start preparation"}
                    </Button>
                    {!approved && (
                      <p className="text-xs text-muted-foreground">
                        Review and approve the selected CV first.
                      </p>
                    )}
                  </fieldset>
                </details>
              )}
              {!locked && (
                <details className="group min-w-0 rounded-xl border bg-muted/20 p-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-start gap-2">
                      <Settings2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <span>
                        Automation settings
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {app.evidence.preparationMode === "application"
                            ? "Application workflows"
                            : "Legacy CV workflows"}
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <fieldset disabled={busy} className="mt-4 space-y-4">
                    <p className="text-xs leading-5 text-muted-foreground">
                      Application preparation creates independent requirements
                      for this job. Selecting it prevents new legacy CV-approval
                      preparation workflows for this CV across its applications.
                      Existing runs stay in history and must finish first.
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      To start preparation automatically, publish an application
                      workflow with a Prepare application step.
                    </p>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="confirm-preparation-cutover"
                        checked={cutover}
                        onCheckedChange={(value) => setCutover(value === true)}
                      />
                      <Label
                        htmlFor="confirm-preparation-cutover"
                        className="text-xs leading-5"
                      >
                        I reviewed the preparation ownership and its effect on
                        future CV approvals for this CV.
                      </Label>
                    </div>
                    <Button
                      variant="outline"
                      className="h-auto w-full whitespace-normal"
                      disabled={busy || !cutover}
                      onClick={() => void changeMode()}
                    >
                      Use{" "}
                      {app.evidence.preparationMode === "application"
                        ? "legacy CV"
                        : "application"}{" "}
                      preparation automation
                    </Button>
                  </fieldset>
                </details>
              )}
            </aside>
          </div>
        </>
      )}
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review application document</DialogTitle>
            <DialogDescription>
              Review the submitted answers and record an explicit document
              decision.
            </DialogDescription>
          </DialogHeader>
          {review && (
            <fieldset disabled={locked}>
              <SubmissionReview
                id={review}
                displayName={displayName}
                embedded
                onChanged={() => void changed()}
              />
            </fieldset>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
