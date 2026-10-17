import { sql, type SQL } from "drizzle-orm";
export const ARCHIVE_TYPES = [
  "intake",
  "resume",
  "account",
  "template",
  "workflow",
  "workflow_run",
  "submission",
  "ai_run",
  "hiring_application",
  "hiring_pipeline",
] as const;
export type ArchiveType = (typeof ARCHIVE_TYPES)[number];
export const ARCHIVE_LABELS: Record<ArchiveType, string> = {
  intake: "Candidate intake",
  resume: "Resumes",
  account: "Accounts",
  template: "Templates",
  workflow: "Workflows",
  workflow_run: "Workflow runs",
  submission: "Submissions",
  ai_run: "AI analyses",
  hiring_application: "Hiring applications",
  hiring_pipeline: "Hiring pipelines",
};
export function isArchiveType(value: string): value is ArchiveType {
  return ARCHIVE_TYPES.includes(value as ArchiveType);
}
export function notArchived(type: ArchiveType, id: SQL | unknown) {
  return sql`NOT EXISTS (SELECT 1 FROM archive_records ar WHERE ar.entity_type=${type} AND ar.entity_id=${id})`;
}
