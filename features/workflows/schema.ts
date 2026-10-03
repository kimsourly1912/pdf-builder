import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(), ownerEmail: text("owner_email").notNull(), name: text("name").notNull(),
  draftJson: text("draft_json").notNull(), publishedJson: text("published_json"),
  version: integer("version").notNull().default(0), active: integer("active", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [index("workflows_owner_updated_idx").on(t.ownerEmail, t.updatedAt)]);

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(), workflowId: text("workflow_id").notNull().references(() => workflows.id, { onDelete: "restrict" }),
  ownerEmail: text("owner_email").notNull(), workflowName: text("workflow_name").notNull(), version: integer("version").notNull(),
  resumeId: text("resume_id").notNull(), graphJson: text("graph_json").notNull(), contextJson: text("context_json").notNull().default('{"steps":{}}'),
  status: text("status").notNull().default("queued"), currentNodeId: text("current_node_id").notNull(),
  errorMessage: text("error_message"), passwordHash: text("password_hash"),
  lockToken: text("lock_token"), lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, t => [uniqueIndex("workflow_runs_workflow_resume_unique").on(t.workflowId, t.resumeId), index("workflow_runs_owner_created_idx").on(t.ownerEmail, t.createdAt), index("workflow_runs_status_lock_idx").on(t.status, t.lockedUntil)]);

export const workflowReviewDecisions = sqliteTable("workflow_review_decisions", {
  id: text("id").primaryKey(), runId: text("run_id").notNull().references(() => workflowRuns.id), ownerEmail: text("owner_email").notNull(), candidateId: text("candidate_id").notNull(), runLockToken: text("run_lock_token").notNull(), resumeRevision: text("resume_revision").notNull(), candidateRevision: text("candidate_revision").notNull(), action: text("action").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("workflow_review_decisions_run_idx").on(t.runId)]);

// A trigger validates and removes this transient transaction guard.
export const workflowExecutionGuards = sqliteTable("workflow_execution_guards", {
  runId: text("run_id").notNull(), lockToken: text("lock_token").notNull(), checkedAt: text("checked_at").notNull(),
});

// Published snapshots are recorded transactionally by the publication trigger.
export const workflowVersions = sqliteTable(
  "workflow_versions",
  {
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    ownerEmail: text("owner_email").notNull(),
    name: text("name").notNull(),
    graphJson: text("graph_json").notNull(),
    publishedAt: text("published_at").notNull(),
  },
  (t) => [uniqueIndex("workflow_versions_unique").on(t.workflowId, t.version)],
);
