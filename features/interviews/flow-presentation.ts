import { interviewDetailGuidance } from "./detail-guidance";
import { finalReviewReadiness } from "./final-review";
import { missingFeedback, type InterviewProcess } from "./interviews";

export const WORK_FILTERS = {
  attention: "Needs attention",
  upcoming: "Upcoming appointments",
  missing_feedback: "Missing feedback",
  final_review: "Ready for decision",
  follow_up: "Follow-up due",
} as const;
export const FOLLOW_UP_TIMEZONE = "Asia/Phnom_Penh";
export function followUpToday(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FOLLOW_UP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}
export function interviewWork(process: InterviewProcess, now = Date.now()) {
  const scheduled = process.rounds
    .filter((r) => r.status === "scheduled")
    .sort(
      (a, b) =>
        Date.parse(a.appointment.startsAt) - Date.parse(b.appointment.startsAt),
    );
  const missing = process.rounds.reduce(
    (count, round) => count + missingFeedback(round).length,
    0,
  );
  const active = !process.outcome;
  const followUpDue =
    active &&
    !!process.hold?.followUp &&
    process.hold.followUp <= followUpToday(now);
  const attendanceDue =
    active &&
    !process.hold &&
    scheduled.some((r) => Date.parse(r.appointment.startsAt) <= now);
  const feedbackDue = active && !process.hold && missing > 0;
  const finalReview =
    active &&
    !process.hold &&
    (process.roundsComplete || finalReviewReadiness(process).ready);
  return {
    next: interviewDetailGuidance(process, now),
    scheduled: scheduled[0],
    missing,
    followUpDue,
    attendanceDue,
    feedbackDue,
    finalReview,
    upcoming:
      active &&
      !process.hold &&
      scheduled.some((r) => Date.parse(r.appointment.startsAt) > now),
    attention:
      followUpDue ||
      attendanceDue ||
      feedbackDue ||
      finalReview ||
      (active && !process.hold && !scheduled.length),
    blocker: process.outcome
      ? "Decision recorded"
      : process.hold
        ? followUpDue
          ? "Follow-up date reached"
          : "Interviews paused"
        : feedbackDue
          ? `${missing} feedback ${missing === 1 ? "response" : "responses"} outstanding`
          : attendanceDue
            ? "Attendance needs recording"
            : scheduled.length
              ? "Waiting for interview"
              : finalReview
                ? "Ready for final review"
                : "No appointment scheduled",
  };
}
export function matchesInterviewFilter(
  process: InterviewProcess,
  filter: string,
  now = Date.now(),
) {
  const work = interviewWork(process, now);
  switch (filter) {
    case "all":
      return true;
    case "hold":
      return !process.outcome && !!process.hold;
    case "attention":
      return work.attention;
    case "upcoming":
      return work.upcoming;
    case "missing_feedback":
      return work.feedbackDue;
    case "final_review":
      return work.finalReview;
    case "follow_up":
      return work.followUpDue;
    default:
      return (process.outcome ?? process.stage) === filter;
  }
}
export function elapsedStage(since: string | undefined, now = Date.now()) {
  if (!since || !Number.isFinite(Date.parse(since))) return "—";
  const days = Math.max(0, Math.floor((now - Date.parse(since)) / 86400000));
  return days ? `${days} ${days === 1 ? "day" : "days"}` : "Today";
}

// Replay only lifecycle metadata, never scorecards or reasons, to measure current-status age.
export type StageEvent = {
  action: string;
  at: string;
  roundId?: string;
  interviewers?: string[];
  interviewer?: string;
  status?: string;
  outcome?: string;
};
export function interviewStageSince(events: StageEvent[], createdAt: string) {
  const rounds = new Map<
    string,
    { status: string; interviewers: string[]; submitted: Set<string> }
  >();
  let complete = false,
    paused = false,
    outcome: string | undefined,
    key = "ready",
    since = createdAt;
  for (const event of events) {
    const round = event.roundId ? rounds.get(event.roundId) : undefined;
    switch (event.action) {
      case "schedule":
        if (event.roundId)
          rounds.set(event.roundId, {
            status: "scheduled",
            interviewers: event.interviewers ?? [],
            submitted: new Set(),
          });
        complete = false;
        break;
      case "reschedule":
      case "cancel":
      case "complete":
      case "no_show":
        if (round)
          round.status =
            event.action === "reschedule"
              ? "scheduled"
              : event.action === "cancel"
                ? "cancelled"
                : event.action === "complete"
                  ? "completed"
                  : "no_show";
        complete = false;
        break;
      case "feedback":
        if (round && event.interviewer && event.status === "submitted")
          round.submitted.add(event.interviewer);
        break;
      case "finish_rounds":
        complete = true;
        break;
      case "hold":
        paused = true;
        break;
      case "resume":
        paused = false;
        break;
      case "decide":
      case "correct_decision":
      case "withdraw":
        outcome = event.action === "withdraw" ? "withdrawn" : event.outcome;
        paused = false;
        break;
      case "reopen":
        outcome = undefined;
        paused = false;
        break;
    }
    const values = [...rounds.values()];
    const next =
      outcome ??
      (paused
        ? "hold"
        : values.some(
              (r) =>
                r.status === "completed" &&
                r.interviewers.some((n) => !r.submitted.has(n)),
            )
          ? "feedback"
          : values.some((r) => r.status === "scheduled")
            ? "scheduled"
            : complete
              ? "decision"
              : "ready");
    if (next !== key) {
      since = event.at;
      key = next;
    }
  }
  return since;
}
