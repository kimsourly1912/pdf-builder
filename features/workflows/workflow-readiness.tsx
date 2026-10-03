"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { workflowApi, errorText } from "./client";
import type { WorkflowGraph } from "./workflow";
type Result = {
  issues: {
    nodeId?: string;
    message: string;
    href?: string;
    actionLabel?: string;
  }[];
  checkedAt: string;
  requiresTelegram: boolean;
};
export function WorkflowReadiness({
  id,
  graph,
  onFocus,
  onReady,
}: {
  id: string;
  graph?: WorkflowGraph;
  onFocus?: (id: string) => void;
  onReady?: (ready: boolean) => void;
}) {
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const fingerprint = graph ? JSON.stringify(graph) : null;
  useEffect(() => {
    const controller = new AbortController();
    onReady?.(false);
    const timer = setTimeout(() => {
      setResult(null);
      setError("");
      void workflowApi<Result>(`/api/workflows/${id}/readiness`, {
        signal: controller.signal,
        ...(fingerprint
          ? {
              method: "POST",
              body: JSON.stringify({ graph: JSON.parse(fingerprint) }),
            }
          : {}),
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            setResult(value);
            setError("");
            onReady?.(!value.issues.length);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(errorText(e));
            onReady?.(false);
          }
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, fingerprint, attempt, onReady]);
  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label="Integration readiness"
    >
      <h3 className="font-medium">
        {graph
          ? "Draft integration readiness"
          : "Published integration readiness"}
      </h3>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not check readiness: {error}
        </p>
      ) : !result ? (
        <p className="text-sm text-muted-foreground">Checking configuration…</p>
      ) : (
        <>
          {!result.issues.length ? (
            <p className="text-sm">
              Forms and required integrations are configured.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {result.issues.map((issue, i) => (
                <li key={i} className="space-y-1">
                  <p>{issue.message}</p>
                  {onFocus && issue.nodeId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onFocus(issue.nodeId!)}
                    >
                      Configure step
                    </Button>
                  )}{" "}
                  {issue.href && (
                    <Link className="underline" href={issue.href}>
                      {issue.actionLabel ?? "Open forms"}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {result.requiresTelegram && (
            <p className="text-xs text-muted-foreground">
              Each candidate also needs HR-confirmed Telegram contact. Sent
              messages do not confirm they were read.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Checked {new Date(result.checkedAt).toLocaleTimeString()}.
            Configuration checks do not contact Telegram.
          </p>
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => setAttempt((a) => a + 1)}
      >
        Check again
      </Button>
    </section>
  );
}
