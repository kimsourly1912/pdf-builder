import {
  STAGE_LABELS,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
export const STAGE_DESCRIPTIONS: Record<CandidateStage, string> = {
  new: "CV received. HR has not started review.",
  reviewing: "HR is checking the CV and candidate information.",
  approved: "CV approved. Prepare account access and required forms next.",
  awaiting_forms:
    "Preparation is complete. Waiting for required form submissions.",
  ready: "All required forms were submitted. HR review is pending.",
  accepted:
    "HR accepted all required documents. This is not a hiring decision.",
};
export function stageEvidence(item: CandidateProgress) {
  const f = item.facts;
  if (item.automaticStage === "accepted")
    return `${f.accepted}/${f.required} required documents accepted by HR`;
  if (["ready", "awaiting_forms"].includes(item.automaticStage))
    return `${f.completed}/${f.required} required forms submitted · ${f.assigned} assigned`;
  if (f.verified)
    return item.approvalBy
      ? `CV approved by ${item.approvalBy}`
      : "CV approved by HR";
  if (f.reviewStarted)
    return item.reviewStartedBy
      ? `Review started by ${item.reviewStartedBy}`
      : "HR started CV review";
  if (f.runStatus === "waiting_review")
    return "Workflow paused for HR CV review";
  return "CV received · review has not started";
}
export function preparationLabel(item: CandidateProgress) {
  if (!item.run) return null;
  if (item.run.status === "failed") return "Preparation failed";
  if (["queued", "running"].includes(item.run.status))
    return "Preparation running";
  if (item.run.status === "waiting_review") return "Preparation needs review";
  return null;
}
export function overrideEvidence(item: CandidateProgress) {
  return item.manual
    ? `HR override · actual progress: ${STAGE_LABELS[item.automaticStage]}`
    : null;
}
