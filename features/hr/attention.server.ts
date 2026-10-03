import "server-only";
import { getDatabaseBinding } from "@/db";
import { progressOverview } from "@/features/candidate-progress/progress.server";
import {
  candidateAttention,
  attentionPage,
  type AttentionTask,
} from "./attention";
export async function attentionTasks(owner: string): Promise<AttentionTask[]> {
  const db = getDatabaseBinding();
  const [candidates, unlinked, pending] = await Promise.all([
    progressOverview(owner),
    db
      .prepare(
        "SELECT r.id,r.file_name name,r.created_at at FROM resumes r WHERE r.owner_email=? AND r.candidate_id IS NULL AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id) ORDER BY r.created_at,r.id",
      )
      .bind(owner)
      .all<{ id: string; name: string; at: string }>(),
    db
      .prepare(
        `SELECT s.id,s.recipient_name name,s.recipient_email email,t.name formName,s.submitted_at at,
      (SELECT c.id FROM candidates c WHERE c.owner_email=t.owner_email AND c.user_id=l.assigned_user_id AND EXISTS(SELECT 1 FROM resumes r WHERE r.candidate_id=c.id AND r.owner_email=c.owner_email AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id)) ORDER BY c.id LIMIT 1) candidateId
      FROM submissions s JOIN templates t ON t.id=s.template_id LEFT JOIN recipient_links l ON l.id=s.recipient_link_id LEFT JOIN submission_reviews h ON h.submission_id=s.id
      WHERE t.owner_email=? AND COALESCE(h.status,'pending')='pending' AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='submission' AND a.entity_id=s.id)
      ORDER BY s.submitted_at,s.id`,
      )
      .bind(owner)
      .all<{
        id: string;
        name: string;
        email: string;
        formName: string;
        at: string;
        candidateId: string | null;
      }>(),
  ]);
  return [
    ...candidates.flatMap(candidateAttention),
    ...unlinked.results.map((r) => ({
      id: `cv:${r.id}`,
      type: "cv_review" as const,
      name: r.name,
      email: "",
      candidateId: null,
      detail: "Staff-uploaded CV · candidate not linked yet",
      reason: "This CV needs HR review. AI extraction is optional.",
      action: "Open CV editor",
      href: `/resumes/${r.id}`,
      since: r.at,
      sinceLabel: "Waiting",
      urgent: false,
    })),
    ...pending.results.map((r) => ({
      id: `submission:${r.id}`,
      type: "submission_review" as const,
      name: r.name || r.email || "Unnamed submitter",
      email: r.email,
      candidateId: r.candidateId,
      detail: r.formName,
      reason: "Submitted form awaits HR review.",
      action: "Review submission",
      href: `/submissions/${r.id}/review`,
      since: r.at,
      sinceLabel: "Submitted",
      urgent: false,
    })),
  ];
}
export async function listAttention(owner: string, query: URLSearchParams) {
  return attentionPage(await attentionTasks(owner), query);
}
