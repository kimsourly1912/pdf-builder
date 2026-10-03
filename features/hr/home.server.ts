import "server-only";
import { attentionTasks } from "./attention.server";
import { attentionPage } from "./attention";
export async function hrHome(owner: string) {
  const tasks = await attentionTasks(owner);
  return {
    counts: {
      newCvs: tasks.filter((t) => t.type === "cv_review").length,
      attention: tasks.length,
      awaitingForms: tasks.filter((t) => t.type === "pending_forms").length,
      review: tasks.filter((t) => t.type === "submission_review").length,
    },
    tasks: attentionPage(tasks, new URLSearchParams())
      .items.slice(0, 20)
      .map((t) => ({
        id: t.id,
        name: t.name,
        detail: [t.email, t.detail].filter(Boolean).join(" · "),
        reason: t.reason,
        action: t.action,
        href: t.href,
        at: t.since,
        urgent: t.urgent,
      })),
    total: tasks.length,
  };
}
