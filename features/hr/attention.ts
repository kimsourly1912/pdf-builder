import type { CandidateProgress } from "@/features/candidate-progress/progress";
export const ATTENTION_TYPES = {
  cv_review: "CV review needed",
  telegram: "Telegram contact or setup",
  preparation: "Preparation failed",
  pending_forms: "Forms still pending",
  submission_review: "Submitted forms to review",
  other: "Other blockers",
} as const;
export type AttentionType = keyof typeof ATTENTION_TYPES;
export type AttentionTask = {
  id: string;
  type: AttentionType;
  name: string;
  email: string;
  candidateId: string | null;
  detail: string;
  reason: string;
  action: string;
  href: string;
  since: string | null;
  sinceLabel: string;
  urgent: boolean;
};
export function candidateAttention(item: CandidateProgress): AttentionTask[] {
  const tasks: AttentionTask[] = [];
  const base = {
    name: item.name,
    email: item.email,
    candidateId: item.id,
    detail: item.selectedCv.fileName,
  };
  const add = (
    key: string,
    type: AttentionType,
    reason: string,
    action: string,
    href: string,
    since: string | null,
    urgent = false,
    sinceLabel = "Waiting",
  ) => {
    const task: AttentionTask = {
      ...base,
      id: `candidate:${item.id}:${key}`,
      type,
      reason,
      action,
      href,
      since,
      urgent,
      sinceLabel,
    };
    tasks.push(task);
    return task;
  };
  if (!item.facts.verified && !item.selectedCv.archived)
    add(
      "cv",
      "cv_review",
      item.facts.reviewStarted
        ? "CV review has started. Approval is still needed."
        : "This CV needs HR review. AI extraction is optional.",
      "Review candidate CV",
      `/candidates/${item.id}?tab=documents`,
      item.selectedCv.receivedAt,
    );
  for (const update of item.cvUpdates ?? [])
    if (["pending", "reviewing"].includes(update.status))
      add(
        `update:${update.resumeId}`,
        "cv_review",
        `CV update needs review: ${update.fileName}. Existing preparation and forms stay linked to the reviewed CV.`,
        "Review CV update",
        `/candidates/${item.id}?tab=documents#cv-updates`,
        update.createdAt,
      );
  const activeRun = item.run && !item.run.archived ? item.run : null;
  const contact = item.issues.find((i) => i.key === "contact");
  const telegram = item.issues.find((i) => i.key === "telegram");
  if (contact)
    add(
      "contact",
      "telegram",
      contact.message,
      contact.action,
      contact.href,
      item.activity.find((a) => a.action === "CV approved")?.at ?? null,
      true,
    );
  else if (activeRun && telegram)
    add(
      "telegram",
      "telegram",
      telegram.message,
      telegram.action,
      telegram.href,
      null,
      true,
    );
  if (activeRun?.status === "failed") {
    const issue = item.issues.find((i) => i.key === "run_failed");
    add(
      "failed",
      "preparation",
      issue?.message ??
        "Resolve the failed step before retrying. Completed steps are retained.",
      "View issue and retry",
      `/workflows/${activeRun.workflowId}?tab=runs&run=${activeRun.id}`,
      activeRun.updatedAt,
      true,
      "Last run update",
    );
  }
  const pending = (item.assignments ?? item.forms).filter(
    (f) => !["completed", "cancelled", "expired"].includes(f.status),
  );
  if (pending.length) {
    const times = pending
      .map((f) => f.assignedAt)
      .filter((s): s is string => !!s)
      .sort();
    const task = add(
      "forms",
      "pending_forms",
      `${pending.length} assigned form${pending.length === 1 ? "" : "s"} still awaiting submission. Waiting on the candidate; no deadline is inferred.`,
      "View assigned forms",
      `/candidates/${item.id}?tab=forms`,
      times[0] ?? null,
      false,
      "Assigned",
    );
    task.detail = pending.map((f) => f.name).join(", ");
  }
  const covered = new Set(["cv_update", "contact", "telegram", "run_failed"]);
  for (const issue of item.issues) {
    if (covered.has(issue.key)) continue;
    if (
      item.run?.archived &&
      ["telegram_retry", "uncertain", "multiple_runs"].includes(issue.key)
    )
      continue;
    add(
      issue.key,
      "other",
      issue.message,
      issue.action,
      issue.href,
      null,
      true,
    );
  }
  return tasks;
}
export function attentionResponsibility(task: AttentionTask) {
  return task.type === "pending_forms" ? "candidate" : "hr";
}
export function attentionPage(tasks: AttentionTask[], query: URLSearchParams) {
  const search = (query.get("search") ?? "").trim().slice(0, 200).toLowerCase();
  const type = query.get("type") ?? "all",
    sort = query.get("sort") === "oldest" ? "oldest" : "priority";
  const responsibility = query.get("responsibility") ?? "all";
  const responsibilityCounts = {
    hr: tasks.filter((t) => attentionResponsibility(t) === "hr").length,
    candidate: tasks.filter((t) => attentionResponsibility(t) === "candidate")
      .length,
  };
  const searched = tasks.filter(
    (t) =>
      (responsibility === "all" ||
        !["hr", "candidate"].includes(responsibility) ||
        attentionResponsibility(t) === responsibility) &&
      (!search ||
        `${t.name} ${t.email} ${t.detail} ${t.reason}`
          .toLowerCase()
          .includes(search)),
  );
  const counts = Object.fromEntries(
    Object.keys(ATTENTION_TYPES).map((key) => [
      key,
      searched.filter((t) => t.type === key).length,
    ]),
  ) as Record<AttentionType, number>;
  const items = searched
    .filter(
      (t) =>
        type === "all" ||
        !Object.hasOwn(ATTENTION_TYPES, type) ||
        t.type === type,
    )
    .sort(
      (a, b) =>
        (sort === "priority" ? Number(b.urgent) - Number(a.urgent) : 0) ||
        (a.since ?? "9999").localeCompare(b.since ?? "9999") ||
        a.id.localeCompare(b.id),
    );
  const total = items.length,
    totalPages = Math.max(1, Math.ceil(total / 25)),
    page = Math.min(
      totalPages,
      Math.max(1, Math.floor(Number(query.get("page")) || 1)),
    );
  return {
    items: items.slice((page - 1) * 25, page * 25),
    total,
    totalPages,
    page,
    counts,
    overallTotal: tasks.length,
    responsibilityCounts,
    candidates: new Set(tasks.map((t) => t.candidateId).filter(Boolean)).size,
  };
}
export type AttentionPage = ReturnType<typeof attentionPage>;
export function attentionAge(since: string | null, now = Date.now()) {
  if (!since || !Number.isFinite(Date.parse(since)))
    return "Start time unknown";
  const minutes = Math.max(0, Math.floor((now - Date.parse(since)) / 60000));
  return minutes < 1
    ? "less than a minute"
    : minutes < 60
      ? `${minutes} min`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} hr`
        : `${Math.floor(minutes / 1440)} day${minutes >= 2880 ? "s" : ""}`;
}
