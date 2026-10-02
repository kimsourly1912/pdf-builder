import type { CandidateProgress } from "./progress";
export function submissionProgress(item: CandidateProgress) {
  const f = item.facts;
  if (!f.verified)
    return {
      label: "Needs review",
      next: "Review CV",
      href: `/resumes/${item.selectedCv.id}`,
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
      label: f.required ? "Forms submitted" : "Preparation complete",
      next: "View candidate progress",
      href: `/candidates/${item.id}`,
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
