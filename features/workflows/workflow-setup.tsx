"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useUnsavedChanges } from "@/features/resumes/use-unsaved-changes";
import { workflowApi, errorText } from "./client";
import { WORKFLOW_PRESETS, type WorkflowPreset } from "./presets";
import { guidedGraph, guidedPurpose, guidedFormIssues } from "./guided-setup";
import { graphIdentity, graphChanges } from "./workspace-tools";
import { WorkflowReadiness } from "./workflow-readiness";
import { SampleTest } from "./sample-test";
import {
  TRIGGER_LABELS,
  workflowTrigger,
  graphIssues,
  type FormTarget,
  type TemplateOption,
  type WorkflowDetail,
  type WorkflowSummary,
} from "./workflow";
const STEPS = [
  "Purpose",
  "Forms",
  "Readiness",
  "Sample preview",
  "Review & publish",
];
export function WorkflowSetup({ displayName }: { displayName: string }) {
  const [purpose, setPurpose] = useState<WorkflowPreset>("approval"),
    [name, setName] = useState<string>(WORKFLOW_PRESETS.approval.name),
    [forms, setForms] = useState<FormTarget[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null),
    [options, setOptions] = useState<TemplateOption[]>([]),
    [step, setStep] = useState(0),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [unsupported, setUnsupported] = useState(false);
  const [ready, setReady] = useState(false),
    [reviewedSample, setReviewedSample] = useState(false),
    [confirmOpen, setConfirmOpen] = useState(false),
    [siblings, setSiblings] = useState<WorkflowSummary[]>([]),
    [overlapReady, setOverlapReady] = useState(false),
    [overlapError, setOverlapError] = useState(""),
    [reviewAttempt, setReviewAttempt] = useState(0),
    [published, setPublished] = useState(false);
  useEffect(() => {
    const controller = new AbortController(),
      id = new URLSearchParams(location.search).get("draft");
    void Promise.all([
      workflowApi<{ templates: TemplateOption[] }>("/api/workflows", {
        signal: controller.signal,
      }),
      id
        ? workflowApi<{ workflow: WorkflowDetail }>(
            `/api/workflows/${encodeURIComponent(id)}`,
            { signal: controller.signal },
          )
        : Promise.resolve(null),
    ])
      .then(([data, saved]) => {
        if (controller.signal.aborted) return;
        setOptions(data.templates);
        setLoadError("");
        if (saved) {
          const w = saved.workflow,
            p = guidedPurpose(w.draft);
          setWorkflow(w);
          if (!p || w.archived || w.version > 0) {
            setUnsupported(true);
            return;
          }
          setPurpose(p);
          setName(w.name);
          setForms(
            w.draft.nodes.find((n) => n.kind === "assign_forms")?.config
              .forms ?? [],
          );
          setStep(1);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (step !== 4) return;
    const controller = new AbortController();
    void workflowApi<{ items: WorkflowSummary[] }>("/api/workflows", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setSiblings(data.items);
          setOverlapError("");
          setOverlapReady(true);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setOverlapError(errorText(e));
          setOverlapReady(false);
        }
      });
    return () => controller.abort();
  }, [step, reviewAttempt]);
  const graph = guidedGraph(purpose, forms),
    dirty =
      !published &&
      !unsupported &&
      (workflow
        ? workflow.name !== name ||
          graphIdentity(workflow.draft) !== graphIdentity(graph)
        : step > 0 || name !== WORKFLOW_PRESETS[purpose].name);
  useUnsavedChanges(dirty);
  const formIssues = guidedFormIssues(purpose, forms, options),
    validName = !!name.trim() && name.length <= 120;
  const overlaps = siblings.filter(
    (w) =>
      w.id !== workflow?.id &&
      w.active &&
      w.trigger === WORKFLOW_PRESETS[purpose].trigger &&
      w.trigger !== "manual",
  );
  function move(next: number) {
    setStep(next);
    setError("");
    if (next === 4) {
      setOverlapReady(false);
      setOverlapError("");
    }
  }
  async function refreshForms() {
    setBusy(true);
    setError("");
    try {
      const data = await workflowApi<{ templates: TemplateOption[] }>(
        "/api/workflows",
      );
      setOptions(data.templates);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft(next?: number) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let saved = workflow;
      if (!saved) {
        const response = await workflowApi<{ workflow: WorkflowDetail }>(
          "/api/workflows",
          { method: "POST", body: JSON.stringify({ preset: purpose }) },
        );
        saved = response.workflow;
        setWorkflow(saved);
        const url = new URL(location.href);
        url.searchParams.set("draft", saved.id);
        history.replaceState(history.state, "", url);
      }
      const response = await workflowApi<{ workflow: WorkflowDetail }>(
        `/api/workflows/${saved.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "save",
            name,
            graph,
            expectedUpdatedAt: saved.updatedAt,
          }),
        },
      );
      setWorkflow(response.workflow);
      if (next !== undefined) move(next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!workflow || busy || !ready || !reviewedSample || !overlapReady) return;
    setBusy(true);
    setError("");
    try {
      const check = await workflowApi<{ issues: { message: string }[] }>(
        `/api/workflows/${workflow.id}/readiness`,
        { method: "POST", body: JSON.stringify({ graph }) },
      );
      if (check.issues.length) {
        setReady(false);
        throw new Error(check.issues.map((i) => i.message).join(" "));
      }
      const result = await workflowApi<{ workflow: WorkflowDetail }>(
        `/api/workflows/${workflow.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "publish",
            name,
            graph,
            expectedUpdatedAt: workflow.updatedAt,
          }),
        },
      );
      setWorkflow(result.workflow);
      setPublished(true);
      setConfirmOpen(false);
    } catch (e) {
      setError(errorText(e));
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell displayName={displayName}>
      <Link
        href="/workflows"
        className="mb-4 inline-block text-sm text-muted-foreground"
      >
        ← Workflows
      </Link>
      <PageHeader
        title="Set up a workflow"
        description="Choose what HR needs to accomplish. Save a draft, check setup and preview the process before making it live."
      />
      {loading ? (
        <p className="py-12 text-center">Loading setup…</p>
      ) : loadError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {loadError}
            <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
              Retry setup
            </Button>
          </AlertDescription>
        </Alert>
      ) : unsupported ? (
        <Card className="mt-6">
          <CardContent className="space-y-3 p-6">
            <h2 className="font-semibold">Continue in the workflow editor</h2>
            <p>
              This workflow is published, archived or has custom canvas changes.
              The guide will preserve your existing graph.
            </p>
            <Button asChild>
              <Link href={`/workflows/${workflow?.id}`}>
                Open workflow editor
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : published ? (
        <Card className="mt-6">
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Workflow published</h2>
            <p>
              {name} · Version {workflow?.version}
            </p>
            <p>
              Starts when: {TRIGGER_LABELS[WORKFLOW_PRESETS[purpose].trigger]}.
              Publishing does not process past CVs.
            </p>
            <p className="text-sm text-muted-foreground">
              Review progress in Executions. CV approval, account reuse and
              contact confirmation retain their normal checks.
            </p>
            <Button asChild>
              <Link
                href={`/workflows/${workflow?.id}${purpose === "manual" ? "" : "?tab=runs"}`}
              >
                {purpose === "manual"
                  ? "Open workflow to start preparation"
                  : "View executions"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ol
            aria-label="Setup steps"
            className="my-6 grid grid-cols-2 gap-2 sm:grid-cols-5"
          >
            {STEPS.map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={`rounded-lg border p-3 text-sm ${step === index ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground"}`}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          {workflow && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {dirty ? "Unsaved changes · " : "Inactive draft saved · "}
                {workflow.name}
              </span>
              <Link className="underline" href={`/workflows/${workflow.id}`}>
                Open canvas editor
              </Link>
            </div>
          )}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {error} Your selections are kept.{" "}
                {workflow && (
                  <Link
                    className="underline"
                    href={`/workflows/${workflow.id}`}
                  >
                    Review the saved draft in the editor.
                  </Link>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">{STEPS[step]}</h2>
              {step === 0 && (
                <>
                  <div
                    role="group"
                    aria-label="Workflow purpose"
                    className="grid gap-3 md:grid-cols-3"
                  >
                    {Object.entries(WORKFLOW_PRESETS).map(([key, p]) => (
                      <Button
                        key={key}
                        variant={purpose === key ? "secondary" : "outline"}
                        aria-pressed={purpose === key}
                        className="h-auto min-w-0 flex-col items-start gap-2 whitespace-normal p-4 text-left"
                        onClick={() => {
                          const next = key as WorkflowPreset;
                          setPurpose(next);
                          setName(WORKFLOW_PRESETS[next].name);
                          setForms([]);
                        }}
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-sm font-normal text-muted-foreground">
                          {p.description}
                        </span>
                      </Button>
                    ))}
                  </div>
                  <p className="text-sm">
                    Starts when:{" "}
                    <strong>
                      {TRIGGER_LABELS[WORKFLOW_PRESETS[purpose].trigger]}
                    </strong>
                    . AI extraction is optional.
                  </p>
                  <Button onClick={() => move(1)}>Continue to forms</Button>
                </>
              )}
              {step === 1 && (
                <>
                  <div>
                    <Label htmlFor="setup-name">Workflow name</Label>
                    <Input
                      id="setup-name"
                      maxLength={120}
                      value={name}
                      disabled={busy}
                      onChange={(e) => {
                        setName(e.target.value);
                        setReviewedSample(false);
                      }}
                    />
                  </div>
                  {purpose === "telegram" ? (
                    <p>
                      This purpose records the CV and waits for HR review. It
                      creates no login account, assigns no forms and sends no
                      invitation. Use a separate approval workflow for
                      preparation.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Choose the published forms the candidate must complete.
                        Every selected form is assigned after approval.
                      </p>
                      {!options.length ? (
                        <Alert>
                          <AlertDescription>
                            No published forms are available.{" "}
                            <Link className="underline" href="/forms">
                              Create and publish a form
                            </Link>
                            , then return and refresh.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-3">
                          {options.map((option) => {
                            const selected = forms.find(
                              (f) => f.templateId === option.id,
                            );
                            return (
                              <div
                                key={option.id}
                                className="space-y-2 rounded-lg border p-3"
                              >
                                <label className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    disabled={
                                      busy || (!selected && forms.length >= 20)
                                    }
                                    checked={!!selected}
                                    onChange={(e) => {
                                      setForms(
                                        e.target.checked
                                          ? [
                                              ...forms,
                                              {
                                                templateId: option.id,
                                                roleId:
                                                  option.roles[0]?.id ?? "",
                                              },
                                            ]
                                          : forms.filter(
                                              (f) => f.templateId !== option.id,
                                            ),
                                      );
                                      setReviewedSample(false);
                                    }}
                                    className="mt-1"
                                  />
                                  <span className="min-w-0 break-words">
                                    {option.name}
                                    <span className="block text-xs text-muted-foreground">
                                      {option.kind === "form"
                                        ? "Form builder"
                                        : "PDF template"}
                                    </span>
                                  </span>
                                </label>
                                {selected && option.roles.length > 1 && (
                                  <label className="block text-sm">
                                    Legacy form recipient role
                                    <select
                                      aria-label={`Form role for ${option.name}`}
                                      value={selected.roleId}
                                      className="mt-1 block w-full rounded-md border bg-background p-2"
                                      onChange={(e) => {
                                        setForms(
                                          forms.map((f) =>
                                            f.templateId === option.id
                                              ? { ...f, roleId: e.target.value }
                                              : f,
                                          ),
                                        );
                                        setReviewedSample(false);
                                      }}
                                    >
                                      {option.roles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                          {role.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Choose up to 20 forms. Existing legacy PDF templates
                        keep their recipient-role configuration.
                      </p>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void refreshForms()}
                      >
                        Refresh forms
                      </Button>
                      {formIssues.map((issue, i) => (
                        <p key={i} className="text-sm text-amber-700">
                          {issue}
                        </p>
                      ))}
                    </>
                  )}
                  {!validName && (
                    <p className="text-sm text-destructive">
                      Enter a workflow name within 120 characters.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!workflow && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => move(0)}
                      >
                        Back
                      </Button>
                    )}
                    <Button
                      disabled={busy || !validName || !!formIssues.length}
                      onClick={() => void saveDraft(2)}
                    >
                      {busy ? "Saving draft…" : "Save draft & check readiness"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !validName}
                      onClick={() => void saveDraft()}
                    >
                      Save draft for later
                    </Button>
                  </div>
                </>
              )}
              {step === 2 && workflow && (
                <>
                  <WorkflowReadiness
                    id={workflow.id}
                    graph={graph}
                    onReady={setReady}
                    onFocus={() => move(1)}
                  />
                  <p className="text-sm text-muted-foreground">
                    This checks configuration only. Each candidate’s contact and
                    CV approval are checked when preparation runs.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => move(1)}>
                      Back to forms
                    </Button>
                    <Button onClick={() => move(3)}>
                      Continue to sample preview
                    </Button>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <SampleTest graph={graph} options={options} />
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={reviewedSample}
                      onChange={(e) => setReviewedSample(e.target.checked)}
                      className="mt-1"
                    />
                    I reviewed this sample preview. It did not run a real
                    workflow.
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => move(2)}>
                      Back to readiness
                    </Button>
                    <Button disabled={!reviewedSample} onClick={() => move(4)}>
                      Review publication
                    </Button>
                  </div>
                </>
              )}
              {step === 4 && workflow && (
                <>
                  <div className="rounded-lg bg-muted p-4">
                    <p className="font-medium">{name}</p>
                    <p className="mt-2 text-sm">
                      Purpose: {WORKFLOW_PRESETS[purpose].name}
                    </p>
                    <p className="text-sm">
                      Starts when: {TRIGGER_LABELS[workflowTrigger(graph)]}
                    </p>
                    {forms.length > 0 && (
                      <ul className="mt-3 list-disc pl-5 text-sm">
                        {forms.map((f) => (
                          <li key={f.templateId}>
                            {options.find((o) => o.id === f.templateId)?.name ??
                              "Unavailable form"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-sm">
                      {purpose === "telegram"
                        ? "Waits for HR review; no account, assignments or invitation."
                        : "After CV approval: create or confirm an existing account, link the approved CV, assign forms and send an invitation to HR-confirmed Telegram contact."}
                    </p>
                  </div>
                  <WorkflowReadiness
                    id={workflow.id}
                    graph={graph}
                    onReady={setReady}
                    onFocus={() => move(1)}
                  />
                  {!overlapReady && !overlapError && (
                    <p className="text-sm">Checking active workflows…</p>
                  )}
                  {overlapError && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Could not check other workflows: {overlapError}
                        <Button
                          variant="outline"
                          onClick={() => setReviewAttempt((a) => a + 1)}
                        >
                          Retry workflow check
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  {overlaps.length > 0 && (
                    <Alert>
                      <AlertDescription>
                        Other active workflows use this starting event. A
                        matching CV can start each of them.
                        <ul className="mt-2 list-disc pl-5">
                          {overlaps.map((w) => (
                            <li key={w.id}>
                              <Link
                                className="underline"
                                href={`/workflows/${w.id}`}
                              >
                                {w.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Publishing activates this workflow for future matching
                    events. It does not process existing CVs or send a message
                    now. Published forms are pinned to their current versions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => move(3)}
                    >
                      Back to preview
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        !ready ||
                        !overlapReady ||
                        !!graphIssues(graph).length ||
                        !reviewedSample
                      }
                      onClick={() => setConfirmOpen(true)}
                    >
                      Review & publish
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publish {name}?</DialogTitle>
            <DialogDescription>
              Activates the workflow for future matching events. Preparation can
              create accounts, assign forms and send invitations after the
              normal review and contact checks.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-sm">
            {graphChanges(workflow?.published, graph).map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
          {overlaps.length > 0 && (
            <p className="text-sm">
              {overlaps.length} other active workflow(s) use this starting
              event.
            </p>
          )}
          <Button
            disabled={busy || !ready || !overlapReady}
            onClick={() => void publish()}
          >
            {busy ? "Publishing…" : "Confirm publish"}
          </Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
