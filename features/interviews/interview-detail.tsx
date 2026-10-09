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
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowRight, Check } from "lucide-react";
import { interviewDetailGuidance } from "./detail-guidance";
import { InterviewDocuments } from "./interview-documents";
import { InterviewHistory } from "./interview-history";
import { InterviewGuide } from "./interview-guide";
import { InterviewStatusActions } from "./interview-actions";
import { FinalDecision } from "./final-decision";
import { Badge } from "@/components/ui/badge";
import { RoundAppointment, RoundFeedback } from "./round-presentation";
import { Button } from "@/components/ui/button";
import { errorText } from "@/features/workflows/client";
import {
  INTERVIEW_LABELS,
  missingFeedback,
  type InterviewProcess,
  type InterviewRound,
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
      setNotice(
        (
          {
            hold: "Interviews paused. Resume when you are ready to continue.",
            resume: "Interviews resumed from the previous step.",
            withdraw:
              "Candidate withdrawal recorded. This interview process is now closed.",
            finish_rounds:
              "The rounds are complete. Choose the final outcome next.",
            decide:
              "Final decision saved. This interview process is now closed.",
            correct_decision:
              "Final decision corrected. The earlier outcome is kept in History.",
            reopen:
              "Interviews reopened. The earlier decision is kept in History.",
            schedule: "Appointment saved. Notify the candidate separately.",
            reschedule:
              "New appointment saved. The earlier appointment is kept in History.",
            cancel:
              "Appointment cancelled. The interview process remains open.",
            complete:
              "Interview completed. Collect feedback from each interviewer next.",
            no_show: "No-show recorded. The interview process remains open.",
          } as Record<string, string>
        )[String(values.action)] ?? "Interviewer feedback saved.",
      );
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
                label={
                  process.hold
                    ? "Interviews paused"
                    : guidance?.action === "finish_rounds"
                      ? "Ready for final review"
                      : INTERVIEW_LABELS[process.outcome ?? process.stage]
                }
                tone={
                  process.outcome === "passed"
                    ? "success"
                    : process.outcome === "not_selected"
                      ? "danger"
                      : process.hold || process.stage === "feedback"
                        ? "warning"
                        : "info"
                }
              />
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
                    process.outcome ||
                    process.roundsComplete ||
                    guidance?.action === "finish_rounds"
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
                title="Interviews paused"
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
              {editable && guidance?.action === "finish_rounds" && (
                <Button
                  variant="outline"
                  disabled={busy || loading}
                  onClick={() => open("schedule", "Schedule another round")}
                >
                  Schedule another round
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={`/candidates/${process.candidateId}`}>
                  Candidate profile
                </Link>
              </Button>
              <InterviewStatusActions
                process={process}
                disabled={busy || loading}
                onChoose={(action, title) =>
                  open(action, title, undefined, undefined, "process-actions")
                }
              />
            </div>
          </section>
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="min-w-0 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit">
                <TabsTrigger value="interviews">Interviews</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <InterviewGuide process={process} />
            </div>
            <TabsContent value="documents" className="space-y-6">
              <InterviewDocuments process={process} />
            </TabsContent>
            <TabsContent value="interviews" className="space-y-6">
              <FinalDecision
                process={process}
                busy={busy || loading}
                onAction={open}
              />
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
                      <Badge variant="outline">
                        Round {process.rounds.length - i}
                      </Badge>
                      <h3 className="min-w-0 break-words text-lg font-semibold">
                        {r.name}
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
                    <RoundAppointment round={r} />
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
                      <RoundFeedback
                        round={r}
                        editable={editable && !process.roundsComplete}
                        busy={busy}
                        onEdit={(interviewer, draft) =>
                          open(
                            "feedback",
                            draft ? "Edit feedback draft" : "Record feedback",
                            r,
                            interviewer,
                          )
                        }
                      />
                    )}
                  </article>
                ))}
              </section>
            </TabsContent>
            <TabsContent value="history" className="space-y-6">
              <InterviewHistory process={process} />
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
