import type { CandidateStage, CandidateProgress } from "./progress";

export const STATUS_COLORS = {
  neutral:
    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  waiting:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  active:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  complete:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  issue:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};
export function statusColor(label: string) {
  if (["Failed", "Rejected", "Cancelled"].includes(label))
    return STATUS_COLORS.issue;
  if (
    [
      "Needs review",
      "Reviewing CV",
      "Awaiting forms",
      "Forms to review",
      "Waiting for CV review",
      "Waiting for Telegram connection",
      "Telegram retry pending",
    ].includes(label)
  )
    return STATUS_COLORS.waiting;
  if (
    [
      "CV approved",
      "Preparing account/forms",
      "Running",
      "Invitation sent",
    ].includes(label)
  )
    return STATUS_COLORS.active;
  if (
    [
      "Ready for HR",
      "Documents accepted",
      "Forms submitted",
      "Preparation complete",
      "Completed",
    ].includes(label)
  )
    return STATUS_COLORS.complete;
  return STATUS_COLORS.neutral;
}
export function runStatusLabel(status: string, waitingFor?: string) {
  if (waitingFor === "telegram") return "Waiting for Telegram connection";
  if (waitingFor === "telegram_retry") return "Telegram retry pending";
  return (
    (
      {
        queued: "Queued",
        running: "Running",
        waiting_review: "Waiting for CV review",
        completed: "Completed",
        rejected: "Rejected",
        failed: "Failed",
        cancelled: "Cancelled",
      } as Record<string, string>
    )[status] ?? "Unknown status"
  );
}
export function stageAge(
  stage: CandidateStage,
  since: string | null,
  now = Date.now(),
) {
  const label = {
    new: "Needs review",
    reviewing: "Reviewing CV",
    approved: "CV approved",
    awaiting_forms: "Awaiting forms",
    ready: "Forms to review",
    accepted: "Documents accepted",
  }[stage];
  if (!since || !Number.isFinite(Date.parse(since)))
    return `${label} · start time unknown`;
  const days = Math.floor(Math.max(0, now - Date.parse(since)) / 86400000);
  return `${label} ${days ? `for ${days} day${days === 1 ? "" : "s"}` : "since today"}`;
}

export function candidateCvPreview(
  item: CandidateProgress,
  resumeId: string | null,
) {
  return (
    item.cvs.find((cv) => cv.id === resumeId && !cv.archived) ?? item.selectedCv
  );
}
