import type { CandidateStage } from "./progress";
export function stageSince(
  stage: CandidateStage,
  evidence: {
    receivedAt: string;
    approvedAt: string | null;
    approvalCurrent: boolean;
    cvChangedAt: string;
    candidateChangedAt: string;
    manualAt?: string;
    reviewStartedAt?: string;
    preparationCompletedAt?: string;
    formCompletedAt: string[];
    formReviewedAt?: string[];
    formCorrectionAt?: string[];
  },
) {
  if (evidence.manualAt) return evidence.manualAt;
  if (stage === "new")
    return evidence.approvedAt && !evidence.approvalCurrent
      ? [evidence.cvChangedAt, evidence.candidateChangedAt].sort().at(-1)!
      : evidence.receivedAt;
  if (stage === "reviewing") return evidence.reviewStartedAt ?? null;
  if (stage === "approved") return evidence.approvedAt;
  if (stage === "awaiting_forms")
    return (
      [evidence.preparationCompletedAt, ...(evidence.formCorrectionAt ?? [])]
        .filter((s): s is string => !!s)
        .sort()
        .at(-1) ?? null
    );
  if (stage === "accepted")
    return evidence.formReviewedAt?.sort().at(-1) ?? null;
  if (stage === "ready" && evidence.preparationCompletedAt)
    return [evidence.preparationCompletedAt, ...evidence.formCompletedAt]
      .sort()
      .at(-1)!;
  return null;
}
