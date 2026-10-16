import type {
  ProgressForm,
  ProgressCv,
} from "@/features/candidate-progress/progress";
export const ACTIVE_STAGES = [
  "ready",
  "scheduled",
  "feedback",
  "decision",
] as const;
export const OUTCOMES = ["passed", "not_selected", "withdrawn"] as const;
export type InterviewStage = (typeof ACTIVE_STAGES)[number];
export type InterviewOutcome = (typeof OUTCOMES)[number];
export const INTERVIEW_LABELS = {
  ready: "Ready to schedule",
  scheduled: "Scheduled",
  feedback: "Awaiting feedback",
  decision: "Decision pending",
  passed: "Interview passed",
  not_selected: "Not selected",
  withdrawn: "Withdrawn",
};
export const CRITERIA = [
  "Relevant skills",
  "Relevant experience",
  "Communication required for the role",
  "Role-specific requirements",
] as const;
export const RECOMMENDATIONS = {
  proceed: "Proceed",
  do_not_proceed: "Do not proceed",
  another_interview: "Another interview needed",
};
export type Recommendation = keyof typeof RECOMMENDATIONS;
export type Scorecard = {
  ratings: (number | null)[];
  notes: string;
  strengths: string;
  concerns: string;
  recommendation: Recommendation;
};
export type Appointment = {
  startsAt: string;
  localDateTime: string;
  timezone: string;
  duration: number;
  kind: "in_person" | "online";
  location: string;
  notes: string;
};
export type InterviewFeedback = {
  interviewer: string;
  status: "draft" | "submitted";
  scorecard: Scorecard;
  enteredBy: string;
  updatedAt: string;
};
export type InterviewRound = {
  id: string;
  name: string;
  interviewers: string[];
  status: "scheduled" | "cancelled" | "completed" | "no_show";
  appointment: Appointment;
  feedback: InterviewFeedback[];
};
export type PreparationSnapshot = {
  contextKind?: "approved_cv";
  name: string;
  email: string;
  telegram: string;
  cv: ProgressCv;
  profileId: string;
  runId: string | null;
  accountId: string | null;
  forms: ProgressForm[];
  acceptedAt: string;
};
export type InterviewProcess = {
  applicationId?: string | null;
  id: string;
  candidateId: string;
  position: string;
  responsible: string;
  version: number;
  createdBy: string;
  createdAt: string;
  stageSince?: string;
  updatedAt: string;
  snapshot: PreparationSnapshot;
  rounds: InterviewRound[];
  roundsComplete: boolean;
  stage: InterviewStage;
  outcome: InterviewOutcome | null;
  decisionReason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  hold: {
    reason: string;
    followUp: string | null;
    previousStage: InterviewStage;
  } | null;
  activity: {
    id: string;
    action: string;
    actor: string;
    at: string;
    details: Record<string, unknown>;
  }[];
};
export function missingFeedback(round: InterviewRound) {
  return round.status === "completed"
    ? round.interviewers.filter(
        (name) =>
          !round.feedback.some(
            (f) => f.interviewer === name && f.status === "submitted",
          ),
      )
    : [];
}
export function interviewStage(
  rounds: InterviewRound[],
  roundsComplete: boolean,
): InterviewStage {
  if (rounds.some((r) => missingFeedback(r).length)) return "feedback";
  if (rounds.some((r) => r.status === "scheduled")) return "scheduled";
  return roundsComplete ? "decision" : "ready";
}
export function interviewNextAction(process: InterviewProcess) {
  if (process.outcome) return "Review decision";
  if (process.hold) return "Resume interview process";
  return {
    ready: "Schedule a round",
    scheduled: "Review appointment",
    feedback: "Record missing feedback",
    decision: "Record final decision",
  }[process.stage];
}
export function appointmentDisplay(a: Appointment) {
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: a.timezone, dateStyle: "medium", timeStyle: "short", hour12: true }).format(new Date(a.startsAt))} · ${a.timezone} · ${a.duration} minutes`;
}

export const INTERVIEW_ACTION_LABELS: Record<string, string> = {
  started: "Moved to interviews",
  schedule: "Round scheduled",
  reschedule: "Appointment rescheduled",
  cancel: "Appointment cancelled",
  complete: "Interview marked completed",
  no_show: "No-show recorded",
  feedback: "Feedback recorded",
  finish_rounds: "Rounds marked complete",
  decide: "Final decision recorded",
  withdraw: "Candidate withdrawn",
  hold: "Interviews paused",
  resume: "Process resumed",
  reopen: "Process reopened",
  correct_decision: "Decision corrected",
};
