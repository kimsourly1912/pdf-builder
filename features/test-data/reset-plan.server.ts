import "server-only";
import type { DatabaseBinding } from "@/db";
import type { ResetChoice } from "./reset";

export type ResetTable = {
  table: string;
  where: string;
  label: string;
  mode?: "update";
};
const own = "(SELECT email FROM reset_owner)";
export function resetTables(choice: ResetChoice): ResetTable[] {
  const cv = choice.scope === "candidates" || choice.scope === "all";
  const all = choice.scope === "all";
  const history = choice.scope === "history";
  const users = `SELECT p.user_id FROM recipient_profiles p JOIN user u ON u.id=p.user_id WHERE p.created_by_email=${own} AND u.email<>${own} AND u.role<>'admin' ${all ? "" : "AND p.account_type='candidate'"}`;
  const runs = `SELECT id FROM workflow_runs WHERE owner_email=${own} ${history ? "AND status IN ('completed','failed','rejected','stopped') AND json_extract(context_json,'$.userId') IS NULL AND NOT EXISTS(SELECT 1 FROM telegram_deliveries d WHERE d.run_id=workflow_runs.id) AND NOT EXISTS(SELECT 1 FROM interview_processes p WHERE p.run_id=workflow_runs.id) AND NOT EXISTS(SELECT 1 FROM hiring_preparations hp WHERE hp.run_id=workflow_runs.id) AND NOT EXISTS(SELECT 1 FROM hiring_applications ha WHERE json_extract(ha.evidence_json,'$.runId')=workflow_runs.id)" : ""}`;
  const links = `SELECT l.id FROM recipient_links l JOIN templates t ON t.id=l.template_id WHERE t.owner_email=${own} ${choice.scope === "candidates" ? `AND l.assigned_user_id IN (${users})` : ""}`;
  const subs = `SELECT id FROM submissions WHERE recipient_link_id IN (${links})`;
  const resumes = `SELECT id FROM resumes WHERE owner_email=${own}`;
  const candidates = `SELECT id FROM candidates WHERE owner_email=${own}`;
  const out: ResetTable[] = [];
  const add = (table: string, where: string, label: string, mode?: "update") =>
    out.push({ table, where, label, mode });
  if (!history) {
    // Clear application links before preparation, CV and interview evidence.
    // Definitions survive ordinary candidate/form resets.
    add("hiring_events", `owner_email=${own}`, "Application history & pending automation");
    add("hiring_receipts", `owner_email=${own}`, "Application request receipts");
    add("hiring_application_forms", `application_id IN (SELECT id FROM hiring_applications WHERE owner_email=${own})`, "Application document references");
    add("hiring_preparations", `owner_email=${own}`, "Application preparation references");
    const processes = `SELECT id FROM interview_processes WHERE owner_email=${own}`;
    const rounds = `SELECT id FROM interview_rounds WHERE process_id IN (${processes})`;
    add("interview_documents", `process_id IN (${processes})`, "Interview accepted documents");
    add("interview_feedback", `round_id IN (${rounds})`, "Interview evaluations");
    add("interview_events", `process_id IN (${processes})`, "Interview history");
    add("interview_rounds", `process_id IN (${processes})`, "Interview rounds");
    add("interview_processes", `owner_email=${own}`, "Interview processes");
    add(
      "form_submission_artifacts",
      `submission_id IN (${subs})`,
      "Generated form PDFs",
    );
    add(
      "submission_reviews",
      `submission_id IN (${subs})`,
      "Form review decisions",
    );
    add("submissions", `id IN (${subs})`, "Form submissions");
    add(
      "form_response_drafts",
      `recipient_link_id IN (${links})`,
      "Saved form drafts",
    );
    add(
      "form_assignments",
      `recipient_link_id IN (${links})`,
      "Form assignments",
    );
    // Delete application assignments before their parent; SET NULL would collide
    // with the legacy account/template/role uniqueness while those forms remain.
    add("hiring_applications", `owner_email=${own}`, "Hiring applications");
    add("recipient_links", `id IN (${links})`, "Form access links");
    add("telegram_deliveries", `owner_email=${own}`, "Telegram invitations");
    add(
      "account_activations",
      `owner_email=${own}`,
      "Account activation links",
    );
  }
  add(
    "workflow_review_decisions",
    `run_id IN (${runs}) AND owner_email=${own}`,
    "Workflow review decisions",
  );
  add("workflow_runs", `id IN (${runs})`, "Preparation runs");
  add(
    "candidate_progress",
    `owner_email=${own} ${history ? `AND primary_run_id IN (${runs})` : ""}`,
    cv ? "Candidate Preparation" : "Candidate Preparation refreshed",
    cv ? undefined : "update",
  );
  if (cv) {
    add(
      "telegram_updates",
      `(chat_id IN (SELECT chat_id FROM telegram_connections WHERE owner_email=${own}) OR ((SELECT is_management FROM reset_owner)=1 AND NOT EXISTS(SELECT 1 FROM telegram_connections other WHERE other.chat_id=telegram_updates.chat_id AND other.owner_email<>${own})))`,
      "Telegram receipts anonymized",
      "update",
    );
    add("telegram_intakes", `owner_email=${own}`, "CV intake records");
    add("telegram_connections", `owner_email=${own}`, "Bot conversations");
    add("candidate_cv_updates", `owner_email=${own}`, "CV update requests");
    add("candidate_cv_reviews", `owner_email=${own}`, "CV review history");
    add(
      "candidate_resume_links",
      `candidate_id IN (${candidates}) AND resume_id IN (${resumes})`,
      "Candidate CV links",
    );
    add(
      "candidate_profile_versions",
      `owner_email=${own}`,
      "CV approval snapshots",
    );
    add(
      "resume_processing_jobs",
      `resume_id IN (${resumes})`,
      "CV processing history",
    );
    add(
      "resume_extractions",
      `resume_id IN (${resumes})`,
      "CV extraction history",
    );
    add("resumes", `id IN (${resumes})`, "CV files");
    add("candidates", `id IN (${candidates})`, "Candidates");
    add("session", `user_id IN (${users})`, "Recipient sessions");
    add("account", `user_id IN (${users})`, "Recipient credentials");
    add(
      "verification",
      `identifier IN (SELECT email FROM user WHERE id IN (${users}))`,
      "Recipient verification requests",
    );
    add("recipient_profiles", `user_id IN (${users})`, "Recipient profiles");
    add("user", `id IN (${users})`, "Recipient login accounts");
  }
  if (all) {
    add("ai_field_detection_runs", `owner_email=${own}`, "AI history");
    if (!choice.keepDefinitions) {
      add("hiring_jobs", `owner_email=${own}`, "Job openings");
      add("hiring_pipeline_references", `owner_email=${own}`, "Legacy pipeline references");
      add("hiring_pipeline_versions", `owner_email=${own}`, "Published hiring models");
      add("hiring_pipelines", `owner_email=${own}`, "Hiring model drafts");
      add(
        "template_versions",
        `template_id IN (SELECT id FROM templates WHERE owner_email=${own})`,
        "Published form versions",
      );
      add("templates", `owner_email=${own}`, "Form templates");
      add(
        "workflow_versions",
        `owner_email=${own}`,
        "Published workflow versions",
      );
      add("workflows", `owner_email=${own}`, "Workflow definitions");
    }
  }
  // Archive and audit selection is added after the membership list is known.
  const types: Record<string, string> = {
    resumes: "resume",
    telegram_intakes: "intake",
    user: "account",
    templates: "template",
    workflows: "workflow",
    workflow_runs: "workflow_run",
    submissions: "submission",
    ai_field_detection_runs: "ai_run",
  };
  const entities = out
    .filter((t) => types[t.table])
    .map(
      (t) =>
        `(entity_type='${types[t.table]}' AND entity_id IN (SELECT id FROM ${t.table} WHERE ${t.where}))`,
    );
  add(
    "archive_records",
    `owner_email=${own} AND (${all && !choice.keepDefinitions ? "1" : entities.join(" OR ") || "0"})`,
    "Archive records",
  );
  if (all)
    add(
      "audit_events",
      `owner_email=${own} AND action<>'test_data.reset'`,
      "Previous activity history",
    );
  return out;
}
export const resetOwnerCte =
  "WITH reset_owner AS (SELECT ? email, ? is_management) ";
export async function snapshotSql(db: DatabaseBinding, tables: ResetTable[]) {
  const rows = await Promise.all(
    tables.map(async (t) => {
      const columns = (
        await db
          .prepare(`PRAGMA table_info(${t.table})`)
          .all<{ name: string }>()
      ).results;
      if (!columns.length || columns.some((c) => !/^[a-z_]+$/u.test(c.name)))
        throw new Error("Unexpected reset schema");
      return `json((SELECT COALESCE(json_group_array(json_array('${t.table}',CAST(rowid AS TEXT),json_object(${columns.map((c) => `'${c.name}',"${c.name}"`).join(",")}))),'[]') FROM ${t.table} WHERE ${t.where}))`;
    }),
  );
  // Cloudflare D1 allows fewer compound SELECT terms than desktop SQLite.
  // Aggregate each table independently, then flatten its JSON array without a UNION chain.
  return `SELECT COALESCE(json_group_array(json(value)),'[]') snapshot FROM (SELECT items.value FROM json_each(json_array(${rows.join(",")})) groups, json_each(groups.value) items ORDER BY json_extract(items.value,'$[0]'),json_extract(items.value,'$[1]'))`;
}

export function busySql() {
  return `EXISTS(SELECT 1 FROM workflow_runs WHERE owner_email=${own} AND (status='running' OR locked_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')))
    OR EXISTS(SELECT 1 FROM ai_field_detection_runs WHERE owner_email=${own} AND status='processing')
    OR EXISTS(SELECT 1 FROM resume_processing_jobs j JOIN resumes r ON r.id=j.resume_id WHERE r.owner_email=${own} AND j.status IN ('processing','running'))
    OR EXISTS(SELECT 1 FROM telegram_intakes WHERE owner_email=${own} AND extraction_status='processing')
    OR EXISTS(SELECT 1 FROM form_submission_artifacts a JOIN submissions s ON s.id=a.submission_id JOIN templates t ON t.id=s.template_id WHERE t.owner_email=${own} AND a.lease_token IS NOT NULL AND a.lease_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    OR EXISTS(SELECT 1 FROM telegram_updates WHERE status IN ('queued','processing') AND ((SELECT is_management FROM reset_owner)=1 OR chat_id IN (SELECT chat_id FROM telegram_connections WHERE owner_email=${own})))`;
}
// Refuse foreign/shared references instead of letting ON DELETE CASCADE/SET NULL alter another scope.
export async function foreignReferenceSql(
  db: DatabaseBinding,
  tables: ResetTable[],
) {
  const deleted = tables.filter((t) => !t.mode);
  const names = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all<{ name: string }>()
  ).results;
  const clauses: string[] = [];
  for (const { name } of names) {
    if (!/^[a-z_]+$/u.test(name)) continue;
    const keys = (
      await db
        .prepare(`PRAGMA foreign_key_list(${name})`)
        .all<{ table: string; from: string; to: string }>()
    ).results;
    for (const key of keys) {
      const parent = deleted.find((t) => t.table === key.table);
      if (!parent) continue;
      const child = deleted.find((t) => t.table === name);
      clauses.push(
        `EXISTS(SELECT 1 FROM ${name} WHERE "${key.from}" IN (SELECT "${key.to}" FROM ${parent.table} WHERE ${parent.where}) ${child ? `AND NOT (${child.where})` : ""})`,
      );
    }
  }
  return clauses.join(" OR ") || "0";
}
