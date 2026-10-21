import { isApplicationTrigger, workflowTrigger, type WorkflowRun } from "./workflow";
function elapsed(since: string | undefined, now: number) {
  if (!since) return "";
  const duration = now - Date.parse(since);
  if (!Number.isFinite(duration) || duration < 0) return "";
  const minutes = Math.floor(duration / 60000);
  return minutes < 1
    ? " · less than a minute"
    : minutes < 60
      ? ` · ${minutes} min`
      : minutes < 1440
        ? ` · ${Math.floor(minutes / 60)} hr`
        : ` · ${Math.floor(minutes / 1440)} days`;
}
export function executionGuidance(run: WorkflowRun, now = Date.now()) {
  const step = run.graph.nodes.find((n) => n.id === run.currentNodeId);
  const started = run.context.steps[run.currentNodeId]?.startedAt;
  if (run.status === "completed" && isApplicationTrigger(workflowTrigger(run.graph)))
    return {
      title: "Application workflow completed",
      action:
        "The routing path has finished. Open the application to check its current stage and requirements.",
    };
  if (run.status === "completed")
    return {
      title: "Preparation completed",
      action:
        "Check Candidate Preparation for invitation and form submission status.",
    };
  if (run.status === "rejected")
    return {
      title: "CV rejected",
      action: "Review the recorded decision before making further changes.",
    };
  if (run.status === "failed")
    return {
      title: "Needs attention",
      action:
        "Resolve the reported issue, then retry. Completed steps are retained.",
    };
  if (run.context.waitingFor === "telegram")
    return {
      title: `Waiting for Telegram confirmation${elapsed(started, now)}`,
      action:
        "Confirm this candidate’s Telegram contact and check bot configuration. This is a deliberate wait, not a stuck execution.",
    };
  if (run.context.waitingFor === "telegram_retry")
    return {
      title: `Waiting for Telegram retry${elapsed(started, now)}`,
      action:
        "Delivery is waiting to retry. Check the invitation status before resending.",
    };
  if (run.status === "waiting_review" || step?.kind === "review_resume")
    return {
      title: `Waiting for HR review${elapsed(run.context.reviewStartedAt ?? started, now)}`,
      action:
        "Open the CV editor to review and approve or reject. Human review has no automatic timeout.",
    };
  const lastActivity = Date.parse(run.updatedAt);
  if (
    (run.status === "queued" || run.status === "running") &&
    Number.isFinite(lastActivity) &&
    now - lastActivity > 15 * 60000
  )
    return {
      title: "Processing may be delayed",
      action:
        "No execution update for over 15 minutes. Refresh progress and check the scheduled worker; this does not prove the run has failed.",
    };
  return {
    title: run.status === "queued" ? "Waiting for processing" : "Processing",
    action:
      "Progress refreshes automatically. You can leave this page and return later.",
  };
}
