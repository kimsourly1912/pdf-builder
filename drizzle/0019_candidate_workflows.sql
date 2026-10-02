CREATE TABLE workflows (
  id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, name TEXT NOT NULL,
  draft_json TEXT NOT NULL, published_json TEXT, version INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX workflows_owner_updated_idx ON workflows(owner_email, updated_at);
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY NOT NULL, workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,
  owner_email TEXT NOT NULL, workflow_name TEXT NOT NULL, version INTEGER NOT NULL,
  resume_id TEXT NOT NULL, graph_json TEXT NOT NULL, context_json TEXT NOT NULL DEFAULT '{"steps":{}}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','waiting_review','completed','rejected','failed')),
  current_node_id TEXT NOT NULL, error_message TEXT, password_hash TEXT, lock_token TEXT, locked_until TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX workflow_runs_workflow_resume_unique ON workflow_runs(workflow_id,resume_id);
CREATE INDEX workflow_runs_owner_created_idx ON workflow_runs(owner_email,created_at);
CREATE INDEX workflow_runs_status_lock_idx ON workflow_runs(status,locked_until);
CREATE TABLE workflow_review_decisions (
  id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL REFERENCES workflow_runs(id),
  owner_email TEXT NOT NULL, candidate_id TEXT NOT NULL, run_lock_token TEXT NOT NULL,
  resume_revision TEXT NOT NULL, candidate_revision TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('save','approve')), created_at TEXT NOT NULL
);
CREATE INDEX workflow_review_decisions_run_idx ON workflow_review_decisions(run_id);
-- A stale review aborts the entire D1 batch before changing candidate data.
CREATE TRIGGER workflow_review_revision_guard
BEFORE INSERT ON workflow_review_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM workflow_runs w
  JOIN resumes r ON r.id = w.resume_id AND r.owner_email = w.owner_email
  JOIN candidates c ON c.id = r.candidate_id AND c.owner_email = w.owner_email
  WHERE w.id = NEW.run_id AND w.owner_email = NEW.owner_email
    AND w.status = 'running' AND w.lock_token = NEW.run_lock_token
    AND c.id = NEW.candidate_id AND r.updated_at = NEW.resume_revision
    AND c.updated_at = NEW.candidate_revision
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_REVIEW_CHANGED');
END;
