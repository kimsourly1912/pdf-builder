import type { CandidateProgress } from "@/features/candidate-progress/progress";

export function candidateWork(item: CandidateProgress) {
  const f = item.facts;
  if (!f.verified)
    return {
      owner: "HR",
      message:
        "Check the CV and candidate details. Save unfinished edits, then approve when the information is correct.",
    };
  if (item.issues.length)
    return { owner: "HR", message: item.issues[0].message };
  if (item.run && ["queued", "running"].includes(item.run.status))
    return {
      owner: "Automation",
      message:
        "Account and form preparation is running. Completed steps are retained; follow its progress here.",
    };
  if (item.run && ["failed", "waiting_review"].includes(item.run.status))
    return {
      owner: "HR",
      message:
        "Preparation needs attention. Open its details to resolve the waiting or failed step.",
    };
  if (item.automaticStage === "accepted")
    return {
      owner: "Complete",
      message:
        "HR has accepted every required document. The hiring decision is handled separately.",
    };
  if (item.automaticStage === "ready")
    return {
      owner: "HR",
      message: f.required
        ? "Review the submitted answers. Accept each document or request specific corrections."
        : "Preparation is complete. No forms were required by this preparation.",
    };
  if (f.preparationCurrent && f.assigned > f.completed)
    return {
      owner: "Candidate",
      message: `${f.completed} of ${f.required} required forms submitted. The candidate needs to complete the remaining forms; you can check assignments and invitation delivery here.`,
    };
  return {
    owner: "HR",
    message: item.accountCreated
      ? "CV approved and account available. Choose the forms this candidate needs, then share access."
      : "CV approved. Prepare account access, assign forms, and send an invitation using your published preparation workflow.",
  };
}

export function candidateJourney(item: CandidateProgress) {
  const f = item.facts;
  return [
    { label: "CV received", done: true },
    { label: "CV approved", done: f.verified },
    {
      label: "Forms prepared",
      done:
        f.preparationCurrent &&
        f.runStatus === "completed" &&
        f.assigned === f.required,
    },
    {
      label: "Invitation sent",
      done: f.invitationSent,
      optional: !f.invitationRequired,
    },
    {
      label: "Forms submitted",
      done:
        f.preparationCurrent && f.required > 0 && f.completed === f.required,
    },
    {
      label: "Documents accepted",
      done: f.preparationCurrent && f.required > 0 && f.accepted === f.required,
    },
  ];
}
