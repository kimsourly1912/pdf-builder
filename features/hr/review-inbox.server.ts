import "server-only";
import { getDatabaseBinding } from "@/db";
export async function reviewInbox(owner: string, params: URLSearchParams) {
  const status = ["pending", "accepted", "corrections_requested"].includes(
    params.get("status") ?? "",
  )
    ? params.get("status")!
    : "pending";
  const search = (params.get("search") ?? "").trim().slice(0, 200),
    page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const where = `t.owner_email=? AND COALESCE(h.status,'pending')=? AND (?='' OR instr(lower(s.recipient_name||' '||s.recipient_email||' '||t.name),lower(?))>0) AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='submission' AND a.entity_id=s.id)`;
  const db = getDatabaseBinding();
  const total = await db
    .prepare(
      `SELECT count(*) total FROM submissions s JOIN templates t ON t.id=s.template_id LEFT JOIN submission_reviews h ON h.submission_id=s.id WHERE ${where}`,
    )
    .bind(owner, status, search, search)
    .first<{ total: number }>();
  const totalPages = Math.max(1, Math.ceil((total?.total ?? 0) / 25)),
    safePage = Math.min(page, totalPages);
  const rows = await db
    .prepare(
      `SELECT s.id,s.recipient_name name,s.recipient_email email,t.name formName,v.version_number versionNumber,s.submitted_at at FROM submissions s JOIN templates t ON t.id=s.template_id JOIN template_versions v ON v.id=s.template_version_id LEFT JOIN submission_reviews h ON h.submission_id=s.id WHERE ${where} ORDER BY s.submitted_at DESC,s.id LIMIT 25 OFFSET ?`,
    )
    .bind(owner, status, search, search, (safePage - 1) * 25)
    .all<{
      id: string;
      name: string;
      email: string;
      formName: string;
      versionNumber: number;
      at: string;
    }>();
  return {
    items: rows.results,
    total: total?.total ?? 0,
    page: safePage,
    totalPages,
    status,
    search,
  };
}
