import type { CandidateProgress } from "./progress";
export function candidateNextAction(item: CandidateProgress) {
  if (item.facts.verified && item.issues?.length) {
    const issue = item.issues[0];
    return { next: issue.action, href: issue.href };
  }
  if (
    item.facts.verified &&
    item.run &&
    ["queued", "running", "waiting_review", "failed"].includes(item.run.status)
  ) {
    return {
      next:
        item.run.status === "failed" ||
        item.run.status === "waiting_review" ||
        item.attention.length
          ? "Resolve issue"
          : "View progress",
      href: `/workflows/${item.run.workflowId}?tab=runs&run=${item.run.id}`,
    };
  }
  if (
    item.facts.verified &&
    item.attention.length &&
    (item.contactConfirmed || !item.selectedCv.intakeId)
  ) {
    return { next: "Resolve issue", href: `/candidates/${item.id}` };
  }
  return submissionProgress(item);
}
export function submissionProgress(item: CandidateProgress) {
  const f = item.facts;
  if (!f.verified)
    return {
      label: f.reviewStarted || f.runStatus === "waiting_review" ? "Reviewing CV" : "Needs review",
      next: f.reviewStarted || f.runStatus === "waiting_review" ? "Review and approve CV" : "Start CV review",
      href: `/candidates/${item.id}?tab=documents`,
    };
  if (!f.preparationCurrent)
    return {
      label: "CV approved",
      next:
        !item.contactConfirmed && item.selectedCv.intakeId
          ? "Confirm contact"
          : "Prepare candidate",
      href: item.selectedCv.intakeId
        ? `/intake/${item.selectedCv.intakeId}${!item.contactConfirmed ? "#contact" : "#preparation"}`
        : `/candidates/${item.id}`,
    };

  if (
    f.preparationCurrent &&
    f.runStatus === "completed" &&
    f.assigned === f.required &&
    f.completed === f.required &&
    (!f.invitationRequired || f.invitationSent)
  )
    return {
      label: f.required
        ? f.accepted === f.required
          ? "Documents accepted"
          : "Forms submitted"
        : "Preparation complete",
      next: f.required
        ? f.accepted === f.required
          ? "View accepted documents"
          : "Review submitted forms"
        : "View candidate progress",
      href: `/candidates/${item.id}?tab=forms`,
    };
  if (f.invitationSent)
    return {
      label: "Invitation sent",
      next: "Check form completion",
      href: `/candidates/${item.id}`,
    };
  if (
    item.run &&
    !["rejected", "cancelled", "completed"].includes(item.run.status)
  )
    return {
      label: "Preparing account/forms",
      next:
        item.attention.length || item.run.status === "failed"
          ? "Resolve issue"
          : "View progress",
      href: `/workflows/${item.run.workflowId}?tab=runs&run=${item.run.id}`,
    };
  if (!item.run && f.preparationCurrent)
    return {
      label: "Awaiting forms",
      next: "Check form completion",
      href: `/candidates/${item.id}?tab=forms`,
    };
  if (item.run?.status === "completed" && f.preparationCurrent)
    return {
      label: "Preparing account/forms",
      next: "Resolve issue",
      href: `/workflows/${item.run.workflowId}?tab=runs&run=${item.run.id}`,
    };
  if (f.verified)
    return {
      label: "CV approved",
      next:
        !item.contactConfirmed && item.selectedCv.intakeId
          ? "Confirm contact"
          : "Prepare candidate",
      href: item.selectedCv.intakeId
        ? `/intake/${item.selectedCv.intakeId}${!item.contactConfirmed ? "#contact" : "#preparation"}`
        : `/candidates/${item.id}`,
    };
  return {
    label: "Needs review",
    next: "Review CV",
    href: `/resumes/${item.selectedCv.id}`,
  };
}
