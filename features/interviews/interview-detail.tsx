"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import { errorText } from "@/features/workflows/client";
import {
  INTERVIEW_LABELS,
  INTERVIEW_ACTION_LABELS,
  RECOMMENDATIONS,
  CRITERIA,
  appointmentDisplay,
  missingFeedback,
  interviewNextAction,
  type InterviewProcess,
  type InterviewRound,
  type Appointment,
} from "./interviews";
import { interviewApi, InterviewApiError } from "./client";
import {
  InterviewOperationDialog,
  type InterviewOperation,
} from "./interview-forms";
export function InterviewDetail({
  displayName,
  processId,
}: {
  displayName: string;
  processId: string;
}) {
  const [process, setProcess] = useState<InterviewProcess | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<InterviewOperation | null>(null),
    [formError, setFormError] = useState(""),
    [permission, setPermission] = useState(false),
    [notice, setNotice] = useState("");
  const locked = useRef(false),
    receipt = useRef<{ key: string; body: Record<string, unknown> } | null>(
      null,
    ),
    trigger = useRef<HTMLElement | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await interviewApi<{ process: InterviewProcess }>(
        `/api/interviews/${processId}`,
      );
      setProcess(result.process);
      setError("");
      setPermission(false);
    } catch (e) {
      setError(errorText(e));
      setPermission(
        e instanceof InterviewApiError && [401, 403].includes(e.status),
      );
    } finally {
      setLoading(false);
    }
  }, [processId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  function open(
    action: string,
    title: string,
    round?: InterviewRound,
    interviewer?: string,
  ) {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    receipt.current = null;
    setFormError("");
    setOperation({ action, title, round, interviewer });
  }
  function close() {
    setOperation(null);
    setTimeout(() => trigger.current?.focus(), 0);
  }
  async function save(values: Record<string, unknown>) {
    if (!process || locked.current) return;
    locked.current = true;
    setBusy(true);
    setFormError("");
    setNotice("");
    const key = JSON.stringify(values);
    if (receipt.current?.key !== key)
      receipt.current = {
        key,
        body: {
          ...values,
          expectedVersion: process.version,
          mutationId: crypto.randomUUID(),
        },
      };
    try {
      const result = await interviewApi<{ process: InterviewProcess }>(
        `/api/interviews/${processId}`,
        { method: "PATCH", body: JSON.stringify(receipt.current.body) },
      );
      setProcess(result.process);
      setNotice("Interview progress saved.");
      receipt.current = null;
      close();
    } catch (e) {
      setFormError(errorText(e));
      if (e instanceof InterviewApiError && e.status === 409) {
        receipt.current = null;
        await load();
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const editable = !!process && !process.outcome && !process.hold;
  function primary() {
    if (!process) return;
    if (process.hold) open("resume", "Resume process");
    else if (process.stage === "ready") open("schedule", "Schedule round");
    else if (process.stage === "decision")
      open("decide", "Record final decision");
    else if (process.stage === "feedback") {
      const r = process.rounds.find((r) => missingFeedback(r).length);
      if (r) open("feedback", "Record feedback", r, missingFeedback(r)[0]);
    } else
      document
        .getElementById("interview-rounds")
        ?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <AppShell displayName={displayName}>
      <Link
        href="/interviews"
        className="text-sm text-muted-foreground underline"
      >
        Interview Progress
      </Link>
      <PageHeader
        className="[&_h1]:break-words [&_p]:break-words"
        title={process?.snapshot.name ?? "Interview detail"}
        description={
          process
            ? `${process.position} · ${process.snapshot.email}${process.snapshot.telegram ? ` · @${process.snapshot.telegram}` : ""}`
            : "Loading interview process…"
        }
        actions={
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      />
      {error && (
        <FeedbackAlert
          tone="error"
          title={
            permission
              ? "Interview access required"
              : "Interview could not be loaded"
          }
          description={
            <div className="space-y-2">
              <p>{error}</p>
              {permission ? (
                <Link href="/sign-in" className="underline">
                  Sign in with the management owner account
                </Link>
              ) : (
                <Button onClick={() => void load()} variant="outline">
                  Try again
                </Button>
              )}
            </div>
          }
        />
      )}
      {loading && <p role="status">Loading interview detail…</p>}
      {notice && (
        <FeedbackAlert tone="success" title="Saved" description={notice} />
      )}
      {process && !permission && (
        <>
          <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={INTERVIEW_LABELS[process.outcome ?? process.stage]}
                tone={
                  process.outcome === "passed"
                    ? "success"
                    : process.outcome === "not_selected"
                      ? "danger"
                      : process.stage === "feedback"
                        ? "warning"
                        : "info"
                }
              />
              {process.hold && <StatusBadge label="On hold" tone="warning" />}
            </div>
            <p className="break-words text-sm">
              Responsible: {process.responsible} · Started by{" "}
              {process.createdBy} on{" "}
              {new Date(process.createdAt).toLocaleString()}
            </p>
            {process.hold && (
              <FeedbackAlert
                tone="warning"
                title="On hold"
                description={`${process.hold.reason}${process.hold.followUp ? ` · Follow up ${process.hold.followUp}` : ""}. Resume returns to ${INTERVIEW_LABELS[process.hold.previousStage]}.`}
              />
            )}
            <div className="flex flex-wrap gap-2">
              {!process.outcome && (
                <Button onClick={primary} disabled={busy}>
                  {interviewNextAction(process)}
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/candidates/${process.candidateId}`}>
                  Candidate profile
                </Link>
              </Button>
              {editable && (
                <Button
                  variant="outline"
                  onClick={() => open("hold", "Put on hold")}
                >
                  On hold
                </Button>
              )}
              {!process.outcome && (
                <Button
                  variant="outline"
                  onClick={() => open("withdraw", "Record withdrawal")}
                >
                  Withdrawn
                </Button>
              )}
            </div>
          </section>
          <section className="space-y-3 rounded-lg border p-4 sm:p-6">
            <h2 className="font-semibold">Accepted preparation & documents</h2>
            <p className="text-sm text-muted-foreground">
              Original accepted context from{" "}
              {new Date(process.snapshot.acceptedAt).toLocaleString()}. Later CV
              or preparation changes do not replace it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant="outline"
                className="h-auto max-w-full whitespace-normal break-words text-left"
              >
                <Link href={`/api/resumes/${process.snapshot.cv.id}/download`}>
                  CV: {process.snapshot.cv.fileName}
                </Link>
              </Button>
              {process.snapshot.accountId && (
                <Button asChild variant="outline">
                  <Link
                    href={`/accounts?account=${process.snapshot.accountId}`}
                  >
                    Linked account
                  </Link>
                </Button>
              )}
            </div>
            <ul className="space-y-2 text-sm">
              {process.snapshot.forms.map((f) => (
                <li key={f.id} className="flex flex-wrap gap-2">
                  <span className="break-words">
                    {f.name} · Documents accepted
                  </span>
                  {f.responseUrl && (
                    <Link className="underline" href={f.responseUrl}>
                      Review accepted submission
                    </Link>
                  )}
                  {f.url && (
                    <Link className="underline" href={f.url}>
                      PDF
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section id="interview-rounds" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Interview rounds</h2>
              {editable &&
                !process.rounds.some(
                  (r) => r.status === "scheduled" || missingFeedback(r).length,
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => open("schedule", "Schedule round")}
                  >
                    Schedule another round
                  </Button>
                )}
            </div>
            {!process.rounds.length && (
              <FeedbackAlert
                title="No interview rounds yet"
                description="Schedule the first HR or manager interview. No candidate notification is sent."
              />
            )}
            {process.rounds.map((r, i) => (
              <article
                key={r.id}
                className="min-w-0 space-y-4 rounded-lg border bg-card p-4 sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words font-semibold">
                    Round {i + 1}: {r.name}
                  </h3>
                  <StatusBadge
                    label={r.status.replaceAll("_", " ")}
                    tone={
                      r.status === "completed"
                        ? "success"
                        : r.status === "no_show"
                          ? "warning"
                          : "neutral"
                    }
                  />
                </div>
                <p className="break-words text-sm">
                  {appointmentDisplay(r.appointment)}
                </p>
                <p className="break-words text-sm">
                  {r.appointment.kind === "online" ? (
                    <a
                      href={r.appointment.location}
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open HTTPS meeting link
                    </a>
                  ) : (
                    `Location: ${r.appointment.location}`
                  )}
                </p>
                <p className="break-words text-sm">
                  Interviewers: {r.interviewers.join(", ")}
                </p>
                {r.appointment.notes && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    Preparation notes: {r.appointment.notes}
                  </p>
                )}
                {r.status === "scheduled" && (
                  <p className="text-xs text-muted-foreground">
                    Recorded appointment only; no message sent and no attendance
                    confirmation. Time passing never marks it completed.
                  </p>
                )}
                {r.status === "no_show" && (
                  <FeedbackAlert
                    tone="warning"
                    title="No-show is attendance information"
                    description="Choose rescheduling or an explicit closure. No-show does not mean Not selected."
                  />
                )}
                {editable && (
                  <div className="flex flex-wrap gap-2">
                    {["scheduled", "cancelled", "no_show"].includes(
                      r.status,
                    ) && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          open("reschedule", "Reschedule round", r)
                        }
                      >
                        Reschedule
                      </Button>
                    )}
                    {r.status === "scheduled" && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() =>
                            open("cancel", "Cancel appointment", r)
                          }
                        >
                          Cancel appointment
                        </Button>
                        <Button
                          onClick={() => open("complete", "Mark completed", r)}
                        >
                          Mark completed
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => open("no_show", "Record no-show", r)}
                        >
                          Record no-show
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {r.status === "completed" && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Required evaluations</h4>
                    <p className="text-sm text-muted-foreground">
                      {missingFeedback(r).length
                        ? `Missing submitted feedback: ${missingFeedback(r).join(", ")}`
                        : "All required feedback submitted."}
                    </p>
                    {r.interviewers.map((interviewer) => {
                      const f = r.feedback.find(
                        (f) => f.interviewer === interviewer,
                      );
                      return (
                        <section
                          key={interviewer}
                          className="space-y-3 rounded border p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h5 className="break-words text-sm font-medium">
                              {interviewer} · {f?.status ?? "Missing"}
                            </h5>
                            {editable &&
                              !process.roundsComplete &&
                              f?.status !== "submitted" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    open(
                                      "feedback",
                                      f
                                        ? "Edit feedback draft"
                                        : "Record feedback",
                                      r,
                                      interviewer,
                                    )
                                  }
                                >
                                  {f ? "Edit draft" : "Record feedback"}
                                </Button>
                              )}
                          </div>
                          {f && (
                            <>
                              <p className="text-xs text-muted-foreground break-words">
                                Entered by {f.enteredBy} ·{" "}
                                {new Date(f.updatedAt).toLocaleString()}
                              </p>
                              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                                {CRITERIA.map((c, j) => (
                                  <div key={c}>
                                    <dt className="text-muted-foreground">
                                      {c}
                                    </dt>
                                    <dd>
                                      {f.scorecard.ratings[j] ?? "Not assessed"}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              <p className="text-sm">
                                Recommendation:{" "}
                                {RECOMMENDATIONS[f.scorecard.recommendation]}
                              </p>
                              {(
                                ["notes", "strengths", "concerns"] as const
                              ).map(
                                (key) =>
                                  f.scorecard[key] && (
                                    <p
                                      key={key}
                                      className="whitespace-pre-wrap break-words text-sm"
                                    >
                                      {key}: {f.scorecard[key]}
                                    </p>
                                  ),
                              )}
                            </>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
            {editable &&
              process.rounds.some((r) => r.status === "completed") &&
              !process.roundsComplete && (
                <div className="space-y-2">
                  <Button
                    disabled={process.rounds.some(
                      (r) =>
                        r.status === "scheduled" || missingFeedback(r).length,
                    )}
                    onClick={() =>
                      open("finish_rounds", "Mark rounds complete")
                    }
                  >
                    Mark rounds complete for final review
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Requires at least one completed interview, every required
                    evaluation submitted and no scheduled round.
                  </p>
                </div>
              )}
          </section>
          <section className="space-y-3 rounded-lg border p-4 sm:p-6">
            <h2 className="font-semibold">Final decision</h2>
            {process.outcome ? (
              <>
                <p className="font-medium">
                  {INTERVIEW_LABELS[process.outcome]}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {process.decisionReason}
                </p>
                <p className="text-xs text-muted-foreground">
                  Recorded by {process.decidedBy} ·{" "}
                  {process.decidedAt &&
                    new Date(process.decidedAt).toLocaleString()}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => open("reopen", "Reopen process")}
                  >
                    Reopen with reason
                  </Button>
                  {process.stage === "decision" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        open("correct_decision", "Correct final decision")
                      }
                    >
                      Correct decision with reason
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Recommendations support review. The owner records the final
                  decision after explicitly completing the rounds.
                </p>
                {editable && process.stage === "decision" && (
                  <Button
                    onClick={() => open("decide", "Record final decision")}
                  >
                    Record final decision
                  </Button>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Interview passed does not mean Hired. Offers, acceptance and
              onboarding are outside this version.
            </p>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Activity history</h2>
            <ol className="space-y-3">
              {process.activity.map((e) => (
                <li key={e.id} className="space-y-2 rounded border p-3">
                  <p className="font-medium">
                    {INTERVIEW_ACTION_LABELS[e.action] ?? "Interview updated"}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {e.actor} · {new Date(e.at).toLocaleString()}
                  </p>
                  {typeof e.details.reason === "string" && e.details.reason && (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      Reason: {e.details.reason}
                    </p>
                  )}
                  {typeof e.details.interviewer === "string" && (
                    <p className="text-sm">
                      {e.details.interviewer} · {String(e.details.status)}
                    </p>
                  )}
                  {!!e.details.previousAppointment && (
                    <p className="break-words text-sm">
                      Previous appointment:{" "}
                      {appointmentDisplay(
                        e.details.previousAppointment as Appointment,
                      )}{" "}
                      ·{" "}
                      {(e.details.previousAppointment as Appointment).location}
                    </p>
                  )}
                  {!!e.details.appointment && (
                    <p className="break-words text-sm">
                      Recorded appointment:{" "}
                      {appointmentDisplay(e.details.appointment as Appointment)}{" "}
                      · {(e.details.appointment as Appointment).location}
                    </p>
                  )}
                  {!!e.details.previousDecision &&
                    (e.details.previousDecision as { outcome: string | null })
                      .outcome && (
                      <p className="break-words text-sm">
                        Previous decision:{" "}
                        {
                          INTERVIEW_LABELS[
                            (
                              e.details.previousDecision as {
                                outcome: keyof typeof INTERVIEW_LABELS;
                              }
                            ).outcome
                          ]
                        }{" "}
                        ·{" "}
                        {String(
                          (e.details.previousDecision as { reason: string })
                            .reason,
                        )}
                      </p>
                    )}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      {operation && (
        <InterviewOperationDialog
          key={`${operation.action}:${operation.round?.id ?? ""}:${operation.interviewer ?? ""}`}
          operation={operation}
          busy={busy}
          error={formError}
          onClose={close}
          onSave={save}
        />
      )}
    </AppShell>
  );
}
