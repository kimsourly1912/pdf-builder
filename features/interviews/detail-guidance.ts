import { missingFeedback, type InterviewProcess } from "./interviews";

/** Guidance follows the explicit server workflow; time only enables attendance recording. */
export function interviewDetailGuidance(
  process: InterviewProcess,
  now = Date.now(),
) {
  if (process.outcome)
    return {
      title: "This interview process is closed",
      description:
        "Review the final decision below. Use More actions if you need to correct or reopen it.",
      label: "View final decision",
      action: "view_decision",
    };
  if (process.hold)
    return {
      title: "Interviews are on hold",
      description:
        "Resume when you are ready to continue from the previous step.",
      label: "Resume interviews",
      action: "resume",
    };
  const awaiting = process.rounds.find(
    (round) => missingFeedback(round).length,
  );
  if (awaiting)
    return {
      title: "Collect interviewer feedback",
      description: `${missingFeedback(awaiting).join(", ")} still need to submit feedback for ${awaiting.name}. Drafts do not count as submitted feedback.`,
      label: "Add missing feedback",
      action: "feedback",
      round: awaiting,
      interviewer: missingFeedback(awaiting)[0],
    };
  const scheduled = process.rounds.find(
    (round) => round.status === "scheduled",
  );
  if (scheduled)
    return now >= Date.parse(scheduled.appointment.startsAt)
      ? {
          title: "Record what happened at the interview",
          description:
            "If the interview took place, mark it completed to collect feedback. If the candidate did not attend, use the round’s More actions menu.",
          label: "Interview took place",
          action: "complete",
          round: scheduled,
        }
      : {
          title: "Your next interview is scheduled",
          description:
            "Review the appointment below and notify the candidate separately. Record attendance after the start time.",
          label: "View appointment",
          action: "view_rounds",
        };
  if (process.roundsComplete)
    return {
      title: "Ready for the final decision",
      description:
        "All required feedback is submitted and the rounds are complete. Choose Interview passed or Not selected.",
      label: "Record final decision",
      action: "decide",
    };
  if (process.rounds.some((round) => round.status === "completed"))
    return {
      title: "Feedback is complete — choose what comes next",
      description:
        "Move to the final decision, or schedule another round if you need more information.",
      label: "Finish rounds & review",
      action: "finish_rounds",
    };
  return {
    title: process.rounds.length
      ? "Schedule the next interview"
      : "Start with the first interview",
    description:
      "Add the interview date, location, and interviewers. You will record attendance and collect feedback after the interview.",
    label: process.rounds.length
      ? "Schedule another round"
      : "Schedule first interview",
    action: "schedule",
  };
}
