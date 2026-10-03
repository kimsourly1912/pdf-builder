import "server-only";
import { getDatabaseBinding } from "@/db";
import { progressOverview } from "@/features/candidate-progress/progress.server";
import { candidateNextAction } from "@/features/candidate-progress/submission-progress";
import { stageAge } from "@/features/candidate-progress/presentation";
export async function hrHome(owner: string) {
  const db = getDatabaseBinding();
  const [items, unlinked, pending] = await Promise.all([
    progressOverview(owner),
    db
      .prepare(
        "SELECT r.id,r.file_name name,r.created_at at FROM resumes r WHERE r.owner_email=? AND r.candidate_id IS NULL AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id) ORDER BY r.created_at DESC",
      )
      .bind(owner)
      .all<{ id: string; name: string; at: string }>(),
    db
      .prepare(
        `SELECT s.id,s.recipient_name name,s.recipient_email email,t.name formName,s.submitted_at at FROM submissions s JOIN templates t ON t.id=s.template_id
      WHERE t.owner_email=? AND NOT EXISTS(SELECT 1 FROM submission_reviews h WHERE h.submission_id=s.id) AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='submission' AND a.entity_id=s.id) ORDER BY s.submitted_at`,
      )
      .bind(owner)
      .all<{
        id: string;
        name: string;
        email: string;
        formName: string;
        at: string;
      }>(),
  ]);
  const candidateTasks = items
    .filter((i) => i.issues.length || !["ready", "accepted"].includes(i.automaticStage))
    .map((i) => ({
      id: `candidate:${i.id}`,
      name: i.name,
      detail: i.email,
      reason: i.issues[0]?.message ?? stageAge(i.stage, i.stageSince),
      action: candidateNextAction(i).next,
      href: `/candidates/${i.id}?tab=${i.facts.verified ? "overview" : "documents"}`,
      at: i.stageSince ?? i.lastActivity,
      urgent: !!i.issues.length,
    }));
  const tasks = [
    ...candidateTasks,
    ...unlinked.results.map((r) => ({
      id: `cv:${r.id}`,
      name: r.name,
      detail: "Staff upload",
      reason: "New CV needs review",
      action: "Review CV",
      href: `/resumes/${r.id}`,
      at: r.at,
      urgent: false,
    })),
    ...pending.results.map((r) => ({
      id: `form:${r.id}`,
      name: r.name || r.email,
      detail: r.formName,
      reason: "Submitted form awaits HR review",
      action: "Review form",
      href: `/submissions/${r.id}/review`,
      at: r.at,
      urgent: false,
    })),
  ].sort(
    (a, b) => Number(b.urgent) - Number(a.urgent) || a.at.localeCompare(b.at),
  );
  return {
    counts: {
      newCvs:
        items.filter((i) => i.stage === "new").length + unlinked.results.length,
      attention: items.filter((i) => i.issues.length).length,
      awaitingForms: items.filter((i) => i.automaticStage === "awaiting_forms")
        .length,
      review: pending.results.length,
    },
    tasks: tasks.slice(0, 20),
    total: tasks.length,
  };
}
