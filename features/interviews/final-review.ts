import { missingFeedback, type InterviewProcess } from "./interviews";

/** The same evidence required by finish_rounds; this never advances state itself. */
export function finalReviewReadiness(process: InterviewProcess) {
  const completed = process.rounds.filter(
    (round) => round.status === "completed",
  );
  const required = completed.reduce(
    (count, round) => count + round.interviewers.length,
    0,
  );
  const outstanding = completed.flatMap((round) =>
    missingFeedback(round).map((interviewer) => ({ round, interviewer })),
  );
  const scheduled = process.rounds.filter(
    (round) => round.status === "scheduled",
  );
  return {
    completed: completed.length,
    required,
    submitted: required - outstanding.length,
    outstanding,
    scheduled,
    ready:
      completed.length > 0 &&
      outstanding.length === 0 &&
      scheduled.length === 0 &&
      !process.hold &&
      !process.outcome,
  };
}
export const INTERVIEW_OPERATION_COPY: Record<
  string,
  {
    description: string;
    submit: string;
    reasonLabel?: string;
    placeholder?: string;
  }
> = {
  schedule: {
    description:
      "Create an appointment for this candidate. Choose the interviewers, date, time and location. Notify the candidate separately after saving.",
    submit: "Save appointment",
  },
  reschedule: {
    description:
      "Change this round’s appointment. The previous date, time and location remain in History. Notify the candidate separately.",
    submit: "Save new appointment",
    reasonLabel: "Why is the appointment changing?",
  },
  complete: {
    description:
      "Confirm that this interview actually took place. This opens feedback for each named interviewer; it does not make a final decision.",
    submit: "Confirm interview took place",
  },
  no_show: {
    description:
      "Record that the candidate did not attend. The process stays open and you can reschedule. This does not reject the candidate.",
    submit: "Record no-show",
    reasonLabel: "What happened?",
  },
  cancel: {
    description:
      "Cancel this appointment only. The interview process stays open, and you can schedule a new appointment later.",
    submit: "Cancel this appointment",
    reasonLabel: "Why is this appointment cancelled?",
  },
  hold: {
    description:
      "Temporarily pause interviews. Appointments and feedback stay saved. Resume when you are ready; an optional follow-up date is a note, not a reminder.",
    submit: "Pause interviews",
    reasonLabel: "Why are interviews being paused?",
    placeholder: "e.g. Waiting for the position budget to be confirmed",
  },
  resume: {
    description:
      "Continue from the step saved before the pause. This does not create a new appointment or send a message.",
    submit: "Resume interviews",
    reasonLabel: "What changed so interviews can resume?",
  },
  withdraw: {
    description:
      "Use this when the candidate no longer wants to continue. This closes the interview process as Withdrawn, rather than Not selected. Earlier rounds and feedback remain saved.",
    submit: "Confirm candidate withdrawal",
    reasonLabel: "Why did the candidate withdraw?",
    placeholder: "e.g. The candidate accepted another opportunity",
  },
  finish_rounds: {
    description:
      "Confirm you have reviewed all submitted feedback and no more rounds are needed right now. This unlocks the final outcome; it does not close the process or select an outcome.",
    submit: "Continue to final outcome",
  },
  decide: {
    description:
      "Record your decision based on the interviews and feedback. Choose an outcome and explain why. Saving closes this interview process.",
    submit: "Save final decision",
    reasonLabel: "Why was this outcome chosen?",
  },
  correct_decision: {
    description:
      "Replace the recorded final outcome with a correction and a reason. The earlier decision remains in History; the process stays closed.",
    submit: "Save corrected decision",
    reasonLabel: "Why does the final decision need correcting?",
  },
  reopen: {
    description:
      "Reopen this closed process to continue reviewing it. Earlier decisions stay in History. You can add a new round if reassessment is needed.",
    submit: "Reopen interviews",
    reasonLabel: "Why are interviews being reopened?",
  },
};
