CREATE TABLE workflow_execution_guards (
  run_id TEXT NOT NULL, lock_token TEXT NOT NULL, checked_at TEXT NOT NULL
);
-- Abort the entire side-effect batch when the worker's lease is stale.
CREATE TRIGGER workflow_execution_lease_guard
BEFORE INSERT ON workflow_execution_guards
WHEN NOT EXISTS (
  SELECT 1 FROM workflow_runs
  WHERE id = NEW.run_id AND lock_token = NEW.lock_token
    AND status = 'running' AND locked_until > NEW.checked_at
)
BEGIN
  SELECT RAISE(ABORT, 'WORKFLOW_LEASE_CHANGED');
END;
-- The guard exists only for the duration of its INSERT, never as run history.
CREATE TRIGGER workflow_execution_guard_cleanup
AFTER INSERT ON workflow_execution_guards
BEGIN
  DELETE FROM workflow_execution_guards WHERE rowid = NEW.rowid;
END;
