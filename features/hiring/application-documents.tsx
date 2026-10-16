"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { SubmissionReview } from "@/features/hr/submission-review";
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
  const reload = useCallback(async () => {
    try {
      setData(
        await workflowApi<Preparation>(
          `/api/hiring/applications/${app.id}/preparation`,
        ),
      );
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [app.id]);
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0),
      interval = setInterval(() => void reload(), 10000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [reload, app.revision]);
  useEffect(() => {
    let alive = true;
    void Promise.all([
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
    ])
      .then(([w, t]) => {
        if (alive) {
          setWorkflows(
            w.items.filter(
              (w) =>
                w.active &&
                w.hasPreparation &&
                !w.trigger.startsWith("application") &&
                !w.trigger.startsWith("stage_"),
            ),
          );
          setTemplates(t.filter((f) => f.versionId));
        }
      })
      .catch((e) => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, []);
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
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Selected CV: {app.fileName}. Forms below belong to {app.jobTitle}.
        Candidate identity and CV edits may affect the person&apos;s other
        applications; original submitted documents and interview snapshots
        remain retained.
      </p>
      <Button variant="outline" asChild>
        <Link
          href={`/candidates/${app.candidateId}?legacy=1&tab=documents#cv-updates`}
        >
          Shared candidate profile & CV updates
        </Link>
      </Button>
      {locked && (
        <Alert>
          <AlertDescription>
            Resume or reopen this application to continue hiring tasks. Existing
            evidence remains available.
          </AlertDescription>
        </Alert>
      )}
      <details
        className="space-y-4 rounded-xl border bg-card p-4"
        open={!approved}
      >
        <summary className="cursor-pointer font-medium">
          Review selected CV · {approved ? "Approved" : "Review required"}
        </summary>
        <fieldset disabled={locked}>
          <ResumeDetailView
            resumeId={app.resumeId}
            embedded
            onChanged={onChanged}
            onApproved={onChanged}
            onDirtyChange={onDirtyChange}
          />
        </fieldset>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {!locked && (
        <details className="space-y-3 rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Preparation automation:{" "}
            {app.evidence.preparationMode === "application"
              ? "Application workflows"
              : "Legacy CV workflows"}
          </summary>
          <p className="text-sm text-muted-foreground">
            Application preparation creates independent requirements for this
            job. Selecting it prevents new legacy CV-approval preparation
            workflows for this CV across its applications. Existing runs remain
            retained and must finish first. Publish an application workflow with
            Prepare application to start preparation from stage events.
          </p>
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-preparation-cutover"
              checked={cutover}
              onCheckedChange={(v) => setCutover(v === true)}
            />
            <Label htmlFor="confirm-preparation-cutover">
              I reviewed the preparation ownership and its effect on future CV
              approvals for this CV.
            </Label>
          </div>
          <Button
            variant="outline"
            disabled={busy || !cutover}
            onClick={() => void changeMode()}
          >
            Use{" "}
            {app.evidence.preparationMode === "application"
              ? "legacy CV"
              : "application"}{" "}
            preparation automation
          </Button>
        </details>
      )}
      {!data ? (
        <p role="status">Loading application documents…</p>
      ) : (
        <>
          {data.runUnavailable&&<p className="text-sm text-muted-foreground">The original preparation run is archived or unavailable. Review its retained records in Archive before preparing again.</p>}
          {data.run && (
            <section className="space-y-4 rounded-xl border bg-card p-5">
              <h2 className="font-semibold">
                Preparation · {data.run.status.replaceAll("_", " ")}
              </h2>
              <p className="text-sm">
                {data.run.workflowName} · version {data.run.version}
              </p>
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
                <ol className="space-y-2 text-sm">
                  {data.run.graph.nodes
                    .filter((n) =>
                      [
                        "create_account",
                        "link_resume",
                        "assign_forms",
                        "send_telegram",
                      ].includes(n.kind),
                    )
                    .map((n) => (
                      <li
                        key={n.id}
                        className="flex flex-wrap justify-between gap-2"
                      >
                        <span>
                          {
                            (
                              {
                                create_account: "Prepare account",
                                link_resume: "Link approved CV",
                                assign_forms: "Assign required forms",
                                send_telegram: "Deliver invitation",
                              } as Record<string, string>
                            )[n.kind]
                          }
                        </span>
                        <span>
                          {data.run!.context.steps[n.id]?.status ?? "Pending"}
                        </span>
                      </li>
                    ))}
                </ol>
              )}
              {data.run.status === "failed" && !locked && (
                <Button disabled={busy} onClick={() => void retry()}>
                  Retry failed step
                </Button>
              )}
              {!locked &&
                data.run.graph.nodes.some((n) => n.kind === "send_telegram") &&
                data.run.status !== "waiting_review" && (
                  <RunTelegramAction
                    run={data.run}
                    refreshKey={String(app.revision)}
                    onUpdated={() => void changed()}
                  />
                )}
            </section>
          )}
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Required documents</h2>
            <p className="text-sm text-muted-foreground">
              Only these linked assignments count toward this application&apos;s
              requirements. Confirmed reuse shares the submission lifecycle with
              the original application.
            </p>
            {data.forms.map((f) => (
              <article key={f.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">
                    {f.name} · v{f.version}
                  </strong>
                  <Badge variant="outline">{f.reviewStatus ?? f.status}</Badge>
                  {f.provenance !== "created" && (
                    <Badge variant="secondary">Explicitly shared</Badge>
                  )}
                </div>
                {f.submissionId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReview(f.submissionId)}
                  >
                    Review submission
                  </Button>
                )}
              </article>
            ))}
            {!data.forms.length && (
              <p className="text-sm text-muted-foreground">
                No required forms linked yet.
              </p>
            )}
            {data.account && !data.account.disabled && !locked && (
              <div className="space-y-3">
                <p className="text-sm">Account: {data.account.email}</p>
                <div className="space-y-2">
                  <Label htmlFor="application-form">
                    Additional required form
                  </Label>
                  <SelectField
                    id="application-form"
                    value={templateId}
                    onValueChange={(v) => {
                      setTemplateId(v);
                      requestKey.current = crypto.randomUUID();
                    }}
                    placeholder="Choose a published form"
                  >
                    {templates.map((t) => (
                      <SelectFieldOption key={t.id} value={t.id}>
                        {t.name}
                      </SelectFieldOption>
                    ))}
                  </SelectField>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={!templateId || busy || !approved}
                    onClick={() => void assign()}
                  >
                    Assign to this application
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href={`/accounts?account=${data.account.id}`}>
                      Account access
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </section>
          {!locked && (
            <details
              className="space-y-4 rounded-xl border bg-card p-5"
              open={!data.run && !data.forms.length}
            >
              <summary className="cursor-pointer font-medium">
                Prepare account & forms for this application
              </summary>
              <p className="text-sm text-muted-foreground">
                Review the workflow before starting. Account reuse and
                invitation delivery keep their explicit review checks. Existing
                preparation stays in history.
              </p>
              {data.overlaps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm">Existing candidate preparation:</p>
                  {data.overlaps.map((r) => (
                    <p key={r.id} className="text-sm">
                      {r.name} · {r.status}
                    </p>
                  ))}
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="separate-preparation"
                      checked={independent}
                      onCheckedChange={(v) => setIndependent(v === true)}
                    />
                    <Label htmlFor="separate-preparation">
                      Create independent requirements for this application.
                      Existing assignments and invitations remain retained.
                      Active candidate preparation must finish first.
                    </Label>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="application-preparation-workflow">
                  Published preparation workflow
                </Label>
                <SelectField
                  id="application-preparation-workflow"
                  value={workflowId}
                  onValueChange={setWorkflowId}
                  placeholder="Choose a workflow"
                >
                  {workflows.map((w) => (
                    <SelectFieldOption key={w.id} value={w.id}>
                      {w.name}
                    </SelectFieldOption>
                  ))}
                </SelectField>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="confirm-application-preparation"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(v === true)}
                />
                <Label htmlFor="confirm-application-preparation">
                  Prepare this application using the selected workflow and
                  review its account, forms and invitation choices.
                </Label>
              </div>
              <Button
                disabled={
                  busy ||
                  !approved ||
                  !workflowId ||
                  !confirmed ||
                  (data.overlaps.length > 0 && !independent)
                }
                onClick={() => void start()}
              >
                {busy ? "Starting…" : "Start application preparation"}
              </Button>
              {!approved && (
                <p className="text-sm text-muted-foreground">
                  Approve the current CV first.
                </p>
              )}
            </details>
          )}
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
