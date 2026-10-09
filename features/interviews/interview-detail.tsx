"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowRight, Check } from "lucide-react";
import { interviewDetailGuidance } from "./detail-guidance";
import { Button } from "@/components/ui/button";
import { errorText } from "@/features/workflows/client";
import {
  INTERVIEW_LABELS,
  INTERVIEW_ACTION_LABELS,
  RECOMMENDATIONS,
  CRITERIA,
  appointmentDisplay,
  missingFeedback,
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
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("interviews"),
    [now, setNow] = useState(() => Date.now());
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
    restoreFocusId?: string,
  ) {
    trigger.current = restoreFocusId
      ? document.getElementById(restoreFocusId)
      : document.activeElement instanceof HTMLElement
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
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const guidance = process ? interviewDetailGuidance(process, now) : null;
  const editable = !!process && !process.outcome && !process.hold;
  function primary() {
    if (!guidance) return;
    if (
      guidance.action === "view_rounds" ||
      guidance.action === "view_decision"
    ) {
      setTab("interviews");
      setTimeout(
        () =>
          document
            .getElementById(
              guidance.action === "view_rounds"
                ? "interview-rounds"
                : "final-decision",
            )
            ?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
    } else
      open(
        guidance.action,
        guidance.label,
        guidance.round,
        guidance.interviewer,
      );
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
            <p className="break-words text-sm text-muted-foreground">
              Interview owner: {process.responsible}
            </p>
            {process.outcome !== "withdrawn" && (
              <ol
                aria-label="Interview steps"
                className="grid gap-2 sm:grid-cols-3"
              >
                {[
                  "Schedule interview",
                  "Collect feedback",
                  "Final decision",
                ].map((label, i) => {
                  const current =
                    process.outcome || process.roundsComplete
                      ? 2
                      : process.stage === "feedback" ||
                          (process.stage !== "scheduled" &&
                            process.rounds.some(
                              (r) => r.status === "completed",
                            ))
                        ? 1
                        : 0;
                  const completed = i < current || !!process.outcome;
                  return (
                    <li
                      key={label}
                      aria-current={
                        !process.outcome && i === current ? "step" : undefined
                      }
                      className={`flex items-center gap-2 rounded-md border p-3 text-sm ${i === current ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground"}`}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">
                        {completed ? (
                          <Check className="size-3" aria-hidden="true" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {label}
                    </li>
                  );
                })}
              </ol>
            )}
            {guidance && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">{guidance.title}</h2>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {guidance.description}
                </p>
              </div>
            )}
            {process.hold && (
              <FeedbackAlert
                tone="warning"
                title="On hold"
                description={`${process.hold.reason}${process.hold.followUp ? ` · Follow up ${process.hold.followUp}` : ""}. Resume returns to ${INTERVIEW_LABELS[process.hold.previousStage]}.`}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {guidance && (
                <Button onClick={primary} disabled={busy || loading}>
                  {guidance.label}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/candidates/${process.candidateId}`}>
                  Candidate profile
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    id="process-actions"
                    variant="outline"
                    disabled={busy || loading}
                  >
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                    More actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {editable && (
                    <DropdownMenuItem
                      onSelect={() =>
                        open(
                          "hold",
                          "Put interviews on hold",
                          undefined,
                          undefined,
                          "process-actions",
                        )
                      }
                    >
                      Put on hold
                    </DropdownMenuItem>
                  )}
                  {!process.outcome && (
                    <DropdownMenuItem
                      onSelect={() =>
                        open(
                          "withdraw",
                          "Record candidate withdrawal",
                          undefined,
                          undefined,
                          "process-actions",
                        )
                      }
                    >
                      Record candidate withdrawal
                    </DropdownMenuItem>
                  )}
                  {process.outcome && (
                    <DropdownMenuItem
                      onSelect={() =>
                        open(
                          "reopen",
                          "Reopen interviews",
                          undefined,
                          undefined,
                          "process-actions",
                        )
                      }
                    >
                      Reopen interviews
                    </DropdownMenuItem>
                  )}
                  {process.outcome && process.stage === "decision" && (
                    <DropdownMenuItem
                      onSelect={() =>
                        open(
                          "correct_decision",
                          "Correct final decision",
                          undefined,
                          undefined,
                          "process-actions",
                        )
                      }
                    >
                      Correct final decision
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void load()}>
                    Refresh details
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="min-w-0 space-y-6"
          >
            <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit">
              <TabsTrigger value="interviews">Interviews</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="documents" className="space-y-6">
              <section className="space-y-3 rounded-lg border p-4 sm:p-6">
                <h2 className="font-semibold">
                  Accepted preparation & documents
                </h2>
                <p className="text-sm text-muted-foreground">
                  Original accepted context from{" "}
                  {new Date(process.snapshot.acceptedAt).toLocaleString()}.
                  Later CV or preparation changes do not replace it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto max-w-full whitespace-normal break-words text-left"
                  >
                    <Link
                      href={`/api/resumes/${process.snapshot.cv.id}/download`}
                    >
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
            </TabsContent>
            <TabsContent value="interviews" className="space-y-6">
              <section id="interview-rounds" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Interview rounds</h2>
                  {editable &&
                    !process.rounds.some(
                      (r) =>
                        r.status === "scheduled" || missingFeedback(r).length,
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
                {[...process.rounds].reverse().map((r, i) => (
                  <article
                    key={r.id}
                    className="min-w-0 space-y-4 rounded-lg border bg-card p-4 sm:p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">
                        Round {process.rounds.length - i}: {r.name}
                      </h3>
                      <StatusBadge
                        label={
                          {
                            scheduled: "Scheduled",
                            cancelled: "Cancelled",
                            completed: "Completed",
                            no_show: "Candidate did not attend",
                          }[r.status]
                        }
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
                        Notify the candidate separately. After the start time,
                        record whether the interview took place.
                      </p>
                    )}
                    {r.status === "no_show" && (
                      <FeedbackAlert
                        tone="warning"
                        title="No-show is attendance information"
                        description="The candidate did not attend. Reschedule this interview or record withdrawal if the candidate no longer wants to continue. This does not mean Not selected."
                      />
                    )}
                    {editable &&
                      ["scheduled", "cancelled", "no_show"].includes(
                        r.status,
                      ) && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {r.status === "scheduled" && (
                              <Button
                                variant="outline"
                                disabled={
                                  busy ||
                                  now < Date.parse(r.appointment.startsAt)
                                }
                                onClick={() =>
                                  open("complete", "Interview took place", r)
                                }
                              >
                                Interview took place
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                open("reschedule", "Reschedule interview", r)
                              }
                            >
                              Reschedule
                            </Button>
                            {r.status === "scheduled" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="outline"
                                    disabled={busy}
                                    id={`round-actions-${r.id}`}
                                    aria-label={`More actions for ${r.name}`}
                                  >
                                    <MoreHorizontal
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                    More actions
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    disabled={
                                      now < Date.parse(r.appointment.startsAt)
                                    }
                                    onSelect={() =>
                                      open(
                                        "no_show",
                                        "Candidate did not attend",
                                        r,
                                      )
                                    }
                                  >
                                    Candidate did not attend (no-show)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      open(
                                        "cancel",
                                        "Cancel appointment",
                                        r,
                                        undefined,
                                        `round-actions-${r.id}`,
                                      )
                                    }
                                  >
                                    Cancel appointment
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                          {r.status === "scheduled" &&
                            now < Date.parse(r.appointment.startsAt) && (
                              <p className="text-xs text-muted-foreground">
                                Attendance actions become available after the
                                appointment starts.
                              </p>
                            )}
                        </div>
                      )}
                    {r.status === "completed" && (
                      <div className="space-y-3">
                        <h4 className="font-medium">Interviewer feedback</h4>
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
                                  {interviewer} ·{" "}
                                  {f?.status === "submitted"
                                    ? "Submitted"
                                    : f?.status === "draft"
                                      ? "Draft — awaiting submission"
                                      : "Not started"}
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
                                          {f.scorecard.ratings[j] ??
                                            "Not assessed"}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                  <p className="text-sm">
                                    Recommendation:{" "}
                                    {
                                      RECOMMENDATIONS[
                                        f.scorecard.recommendation
                                      ]
                                    }
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
                        variant="outline"
                        disabled={
                          busy ||
                          process.rounds.some(
                            (r) =>
                              r.status === "scheduled" ||
                              missingFeedback(r).length,
                          )
                        }
                        onClick={() =>
                          open("finish_rounds", "Mark rounds complete")
                        }
                      >
                        Mark rounds complete for final review
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Requires at least one completed interview, every
                        required evaluation submitted and no scheduled round.
                      </p>
                    </div>
                  )}
              </section>
              <section
                id="final-decision"
                className="space-y-3 rounded-lg border p-4 sm:p-6"
              >
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
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Recommendations support review. The owner records the
                      final decision after explicitly completing the rounds.
                    </p>
                    {editable && process.stage === "decision" && (
                      <Button
                        variant="outline"
                        disabled={busy}
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
            </TabsContent>
            <TabsContent value="history" className="space-y-6">
              <section className="space-y-3">
                <h2 className="text-lg font-semibold">Activity history</h2>
                <p className="text-sm text-muted-foreground">
                  Appointments, feedback, and decisions are kept here, including
                  earlier versions.
                </p>
                <ol className="space-y-3">
                  {process.activity.map((e) => (
                    <li key={e.id} className="space-y-2 rounded border p-3">
                      <p className="font-medium">
                        {INTERVIEW_ACTION_LABELS[e.action] ??
                          "Interview updated"}
                      </p>
                      <p className="break-words text-xs text-muted-foreground">
                        {e.actor} · {new Date(e.at).toLocaleString()}
                      </p>
                      {typeof e.details.reason === "string" &&
                        e.details.reason && (
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
                          {
                            (e.details.previousAppointment as Appointment)
                              .location
                          }
                        </p>
                      )}
                      {!!e.details.appointment && (
                        <p className="break-words text-sm">
                          Recorded appointment:{" "}
                          {appointmentDisplay(
                            e.details.appointment as Appointment,
                          )}{" "}
                          · {(e.details.appointment as Appointment).location}
                        </p>
                      )}
                      {!!e.details.previousDecision &&
                        (
                          e.details.previousDecision as {
                            outcome: string | null;
                          }
                        ).outcome && (
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
            </TabsContent>
          </Tabs>
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
