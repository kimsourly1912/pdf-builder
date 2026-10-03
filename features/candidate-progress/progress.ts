export const STAGES = [
  "new",
  "reviewing",
  "approved",
  "awaiting_forms",
  "ready",
  "accepted",
] as const;
export type CandidateStage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<CandidateStage, string> = {
  new: "New",
  reviewing: "Reviewing CV",
  approved: "CV approved",
  awaiting_forms: "Awaiting forms",
  ready: "Forms to review",
  accepted: "Documents accepted",
};
export type ProgressFacts = {
  verified: boolean;
  reviewStarted?: boolean;
  preparationCurrent: boolean;
  runStatus: string | null;
  assigned: number;
  required: number;
  completed: number;
  accepted?: number;
  invitationRequired: boolean;
  invitationSent: boolean;
};
export function automaticStage(f: ProgressFacts): CandidateStage {
  if (
    f.preparationCurrent &&
    f.runStatus === "completed" &&
    f.assigned === f.required &&
    f.completed === f.required &&
    (!f.invitationRequired || f.invitationSent)
  )
    return f.required > 0 && f.accepted === f.required ? "accepted" : "ready";
  if (
    f.preparationCurrent &&
    f.runStatus === "completed" &&
    f.assigned === f.required &&
    (!f.invitationRequired || f.invitationSent)
  )
    return "awaiting_forms";
  if (f.verified) return "approved";
  if (f.reviewStarted || f.runStatus === "waiting_review") return "reviewing";
  return "new";
}
export function transitionRequirement(
  f: ProgressFacts,
  target: CandidateStage,
): { kind: "review" | "prepare" | "forms"; message: string } | null {
  if (target === "approved" && !f.verified)
    return {
      kind: "review",
      message:
        "Approve this CV in the Resume Editor before moving it to CV approved. AI is optional.",
    };
  if (
    target === "awaiting_forms" &&
    (!f.preparationCurrent ||
      f.runStatus !== "completed" ||
      f.assigned !== f.required ||
      (f.invitationRequired && !f.invitationSent))
  )
    return {
      kind: "prepare",
      message:
        "Finish candidate preparation and any required invitation before moving to Awaiting forms.",
    };
  if (target === "ready" && !["ready", "accepted"].includes(automaticStage(f)))
    return {
      kind: "forms",
      message:
        "All required forms must be submitted and preparation completed before this candidate is ready for HR.",
    };
  if (target === "accepted" && automaticStage(f) !== "accepted")
    return {
      kind: "forms",
      message:
        "HR must accept every required submitted form before marking documents accepted.",
    };
  return null;
}
export type ProgressCv = {
  id: string;
  fileName: string;
  receivedAt: string;
  verified: boolean;
  archived: boolean;
  intakeId: string | null;
};
export type ProgressRun = {
  id: string;
  workflowId: string;
  resumeId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  waitingFor?: string;
};
export type ProgressForm = {
  id: string;
  name: string;
  status: string;
  completedAt: string | null;
  reused: boolean;
  url: string | null;
  responseUrl?: string | null;
  templateId?: string;
  versionNumber?: number;
  assignedAt?: string;
  reviewStatus?: string;
  isRequired?: boolean;
  fillUrl?: string;
  correctionReason?: string | null;
};
export type CandidateProgress = {
  id: string;
  name: string;
  email: string;
  telegram: string;
  contactConfirmed: boolean;
  stage: CandidateStage;
  automaticStage: CandidateStage;
  manual: boolean;
  revision: string;
  selectedCv: ProgressCv;
  cvs: ProgressCv[];
  currentCv?: ProgressCv;
  cvUpdates?: {resumeId: string; baseResumeId: string; fileName: string; status: string; createdAt: string; updatedAt: string; reason: string | null}[];
  approvalBy?: string | null;
  reviewStartedAt?: string | null;
  reviewStartedBy?: string | null;
  run: ProgressRun | null;
  runs: ProgressRun[];
  facts: ProgressFacts;
  forms: ProgressForm[];
  attention: string[];
  accountCreated: boolean;
  accountId?: string | null;
  accountEmail?: string | null;
  accountDisabled?: boolean;
  assignments?: ProgressForm[];
  invitations?: { id: string; status: string; at: string; runId: string }[];
  lastActivity: string;
  stageSince: string | null;
  issues: { key: string; message: string; action: string; href: string }[];
  activity: {
    id: string;
    action: string;
    actor: string;
    at: string;
    metadata: Record<string, unknown>;
  }[];
};
