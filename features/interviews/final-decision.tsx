"use client";
import { Check, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/patterns/status-badge";
import { FinalReviewSummary } from "./final-review-summary";
import { finalReviewReadiness } from "./final-review";
import {
  INTERVIEW_LABELS,
  type InterviewProcess,
  type InterviewRound,
} from "./interviews";
export function FinalDecision({
  process,
  busy,
  onAction,
}: {
  process: InterviewProcess;
  busy: boolean;
  onAction: (
    action: string,
    title: string,
    round?: InterviewRound,
    interviewer?: string,
  ) => void;
}) {
  const readiness = finalReviewReadiness(process);
  return (
    <section
      id="final-decision"
      className="space-y-4 rounded-lg border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Final decision</h2>
        <StatusBadge
          tone={
            process.outcome === "passed"
              ? "success"
              : process.outcome === "not_selected"
                ? "danger"
                : process.outcome
                  ? "neutral"
                  : process.hold
                    ? "warning"
                    : readiness.ready
                      ? "info"
                      : "neutral"
          }
          label={
            process.outcome
              ? INTERVIEW_LABELS[process.outcome]
              : process.hold
                ? "Paused"
                : process.roundsComplete
                  ? "Choose an outcome"
                  : readiness.ready
                    ? "Ready for review"
                    : "Not ready yet"
          }
        />
      </div>
      <FinalReviewSummary
        key={`${process.id}:${process.roundsComplete}:${readiness.ready}`}
        process={process}
        expanded={
          !!process.outcome || process.roundsComplete || readiness.ready
        }
      />
      {process.outcome ? (
        <>
          <p className="whitespace-pre-wrap break-words text-sm">
            {process.decisionReason}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            Recorded by {process.decidedBy} ·{" "}
            {process.decidedAt &&
              new Date(process.decidedAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
          </p>
          <p className="text-sm text-muted-foreground">
            Use Manage status to reopen interviews
            {process.outcome !== "withdrawn" ? " or correct this outcome" : ""}.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {process.roundsComplete
              ? "The rounds are complete. Choose the final outcome and record your reason."
              : "Complete these requirements, then prepare your final decision. Recommendations help you review; they do not choose the outcome."}
          </p>
          {!process.roundsComplete && (
            <ul
              aria-label="Final review requirements"
              className="grid gap-2 sm:grid-cols-3"
            >
              {[
                {
                  met: readiness.completed > 0,
                  label: readiness.completed
                    ? `${readiness.completed} interview${readiness.completed > 1 ? "s" : ""} completed`
                    : "Complete an interview",
                },
                {
                  met: readiness.required > 0 && !readiness.outstanding.length,
                  label: `${readiness.submitted} of ${readiness.required} feedback submitted`,
                },
                {
                  met: !readiness.scheduled.length,
                  label: readiness.scheduled.length
                    ? "Appointment still scheduled"
                    : "No pending appointment",
                },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-2 rounded-md bg-muted/50 p-3 text-sm"
                >
                  {item.met ? (
                    <Check
                      className="size-4 shrink-0 text-success-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={
                busy ||
                !!process.hold ||
                (!process.roundsComplete && !readiness.ready)
              }
              onClick={() =>
                onAction(
                  process.roundsComplete ? "decide" : "finish_rounds",
                  process.roundsComplete
                    ? "Choose final outcome"
                    : "Prepare final decision",
                )
              }
            >
              {process.roundsComplete
                ? "Choose final outcome"
                : "Prepare final decision"}
              <ArrowRight aria-hidden="true" />
            </Button>
            {!process.hold && readiness.outstanding.length > 0 && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  onAction(
                    "feedback",
                    "Complete interviewer feedback",
                    readiness.outstanding[0].round,
                    readiness.outstanding[0].interviewer,
                  )
                }
              >
                Complete missing feedback
              </Button>
            )}
          </div>
          {process.hold ? (
            <p className="text-xs text-muted-foreground">
              Resume interviews before continuing to a final decision.
            </p>
          ) : readiness.outstanding.length > 0 ? (
            <p className="break-words text-xs text-muted-foreground">
              Still waiting for:{" "}
              {readiness.outstanding
                .map((item) => `${item.interviewer} (${item.round.name})`)
                .join(", ")}
              . Draft feedback must be submitted.
            </p>
          ) : !process.roundsComplete && !readiness.ready ? (
            <p className="text-xs text-muted-foreground">
              Record interview attendance and submit all required feedback
              first.
            </p>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Interview passed means the interview was successful; it does not mark
        the candidate as hired.
      </p>
    </section>
  );
}
