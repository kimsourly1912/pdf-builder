"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RunTelegramAction } from "@/features/telegram/run-telegram-action";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { WorkflowRun } from "@/features/workflows/workflow";
import type { CandidateProgress } from "@/features/candidate-progress/progress";
import { runStatusLabel } from "@/features/candidate-progress/presentation";
export function CandidateRunProgress({
  item,
  onChanged,
}: {
  item: CandidateProgress;
  onChanged: () => void;
}) {
  const [run, setRun] = useState<WorkflowRun | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const id = item.run?.id,
    revision = item.run?.updatedAt;
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    void workflowApi<{ run: WorkflowRun }>(`/api/workflow-runs/${id}`, {
      signal: abort.signal,
    })
      .then((data) => {
        if (!abort.signal.aborted) {
          setRun(data.run);
          setError("");
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorText(e));
      });
    return () => abort.abort();
  }, [id, revision]);
  async function retry() {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      const data = await workflowApi<{ run: WorkflowRun }>(
        `/api/workflow-runs/${run.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action: "retry",
            expectedUpdatedAt: run.updatedAt,
          }),
        },
      );
      setRun(data.run);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  if (!id) return null;
  const current = run?.id === id ? run : null;
  const active = current?.graph.nodes.find(
    (n) => n.id === current.currentNodeId,
  );
  return (
    <section
      id="candidate-preparation"
      tabIndex={-1}
      className="scroll-mt-24 space-y-4 rounded-xl border bg-card p-5"
    >
      <div>
        <h2 className="font-semibold">Preparation progress</h2>
        <p role="status" className="mt-1 text-sm text-muted-foreground">
          {current
            ? runStatusLabel(current.status, current.context.waitingFor)
            : "Loading preparation…"}
        </p>
      </div>
      {current && (
        <>
          <details open={current.status !== "completed"}>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Preparation steps
            </summary>
            <ol className="mt-3 space-y-3" aria-label="Preparation steps">
              {current.graph.nodes
                .filter((n) =>
                  [
                    "create_account",
                    "link_resume",
                    "assign_forms",
                    "send_telegram",
                  ].includes(n.kind),
                )
                .map((n) => {
                  const result = current.context.steps[n.id];
                  return (
                    <li
                      key={n.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span>
                        {
                          (
                            {
                              create_account: "Prepare account",
                              link_resume: "Link approved CV",
                              assign_forms: "Assign forms",
                              send_telegram: "Send invitation",
                            } as Record<string, string>
                          )[n.kind]
                        }
                      </span>
                      <span className="text-muted-foreground">
                        {result?.status === "completed"
                          ? "Complete"
                          : n.id === current.currentNodeId
                            ? "Current step"
                            : "Pending"}
                      </span>
                    </li>
                  );
                })}
            </ol>
          </details>
          {current.errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {current.errorMessage}
            </p>
          )}
          {current.status === "failed" && active?.kind !== "send_telegram" && (
            <Button disabled={busy} onClick={() => void retry()}>
              {busy ? "Retrying…" : "Retry failed step"}
            </Button>
          )}
          {current.graph.nodes.some((n) => n.kind === "send_telegram") &&
            (active?.kind === "send_telegram" ||
              current.context.waitingFor ||
              current.status === "completed") && (
              <RunTelegramAction
                key={current.id}
                run={current}
                refreshKey={`${item.contactConfirmed}:${item.telegram}:${item.lastActivity}`}
                onUpdated={(value) => {
                  setRun(value);
                  onChanged();
                }}
              />
            )}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Workflow details
            </summary>
            <p className="mt-3 break-words">
              {current.workflowName} · v{current.version}
            </p>
            <Button asChild variant="link" className="px-0">
              <Link
                href={`/workflows/${current.workflowId}?tab=runs&run=${current.id}`}
              >
                Open detailed execution
              </Link>
            </Button>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
