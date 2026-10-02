CREATE TABLE archive_records (
 id TEXT PRIMARY KEY NOT NULL, owner_email TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT NOT NULL, label TEXT NOT NULL, group_id TEXT NOT NULL,
 prior_state_json TEXT NOT NULL DEFAULT '{}', archived_by TEXT NOT NULL, archived_at TEXT NOT NULL
);
CREATE UNIQUE INDEX archive_entity_unique ON archive_records(entity_type,entity_id);
CREATE INDEX archive_owner_date_idx ON archive_records(owner_email,archived_at);
-- Include templates archived before the central Archive page existed.
INSERT INTO archive_records(id,owner_email,entity_type,entity_id,label,group_id,archived_by,archived_at)
SELECT 'legacy-template-'||id,owner_email,'template',id,name,'legacy-template-'||id,owner_email,archived_at FROM templates WHERE archived_at IS NOT NULL;
CREATE TABLE archive_transition_guards (owner_email TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,archived_at TEXT NOT NULL,action TEXT NOT NULL);
CREATE TRIGGER archive_transition_guard BEFORE INSERT ON archive_transition_guards
WHEN NOT EXISTS (SELECT 1 FROM archive_records WHERE owner_email=NEW.owner_email AND entity_type=NEW.entity_type AND entity_id=NEW.entity_id AND archived_at=NEW.archived_at)
BEGIN
 SELECT RAISE(ABORT,'ARCHIVE_CHANGED');
END;
CREATE TRIGGER archive_delete_dependency_guard BEFORE INSERT ON archive_transition_guards
WHEN NEW.action='delete' AND (
 NEW.entity_type='submission'
 OR (NEW.entity_type='template' AND (EXISTS(SELECT 1 FROM form_assignments WHERE template_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM submissions WHERE template_id=NEW.entity_id)))
 OR (NEW.entity_type='account' AND (EXISTS(SELECT 1 FROM form_assignments WHERE user_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM recipient_links WHERE assigned_user_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM candidates WHERE user_id=NEW.entity_id)))
 OR (NEW.entity_type='workflow' AND EXISTS(SELECT 1 FROM workflow_runs WHERE workflow_id=NEW.entity_id))
 OR (NEW.entity_type='workflow_run' AND (EXISTS(SELECT 1 FROM workflow_runs WHERE id=NEW.entity_id AND json_extract(context_json,'$.userId') IS NOT NULL) OR EXISTS(SELECT 1 FROM telegram_deliveries WHERE run_id=NEW.entity_id)))
 OR (NEW.entity_type='resume' AND EXISTS(SELECT 1 FROM workflow_runs WHERE resume_id=NEW.entity_id AND status IN ('queued','running','waiting_review')))
 OR (NEW.entity_type='ai_run' AND EXISTS(SELECT 1 FROM ai_field_detection_runs WHERE id=NEW.entity_id AND status='processing'))
)
BEGIN
 SELECT RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED');
END;
CREATE TRIGGER archive_transition_cleanup AFTER INSERT ON archive_transition_guards
BEGIN
 DELETE FROM archive_transition_guards WHERE rowid=NEW.rowid;
END;
ALTER TABLE telegram_connections ADD COLUMN submission_mode TEXT NOT NULL DEFAULT 'initial';
ALTER TABLE telegram_connections ADD COLUMN last_intake_id TEXT;
UPDATE telegram_connections SET submission_mode='completed',last_intake_id=(SELECT id FROM telegram_intakes WHERE connection_id=telegram_connections.id ORDER BY created_at DESC LIMIT 1)
WHERE stage='pdf' AND EXISTS(SELECT 1 FROM telegram_intakes WHERE connection_id=telegram_connections.id);
DROP TRIGGER workflow_execution_lease_guard;
CREATE TRIGGER workflow_execution_lease_guard BEFORE INSERT ON workflow_execution_guards
WHEN NOT EXISTS (
 SELECT 1 FROM workflow_runs w WHERE w.id=NEW.run_id AND w.lock_token=NEW.lock_token AND w.status='running' AND w.locked_until>NEW.checked_at
 AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE (ar.entity_type='workflow_run' AND ar.entity_id=w.id) OR (ar.entity_type='resume' AND ar.entity_id=w.resume_id))
)
BEGIN
 SELECT RAISE(ABORT,'WORKFLOW_LEASE_CHANGED');
END;
CREATE TABLE telegram_replacement_guards(resume_id TEXT NOT NULL,owner_email TEXT NOT NULL,resume_revision TEXT NOT NULL);
CREATE TRIGGER telegram_replacement_guard BEFORE INSERT ON telegram_replacement_guards
WHEN NOT EXISTS(SELECT 1 FROM resumes r WHERE r.id=NEW.resume_id AND r.owner_email=NEW.owner_email AND r.updated_at=NEW.resume_revision AND r.verification_status<>'verified' AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='resume' AND ar.entity_id=r.id))
BEGIN
 SELECT RAISE(ABORT,'CV_REPLACEMENT_CHANGED');
END;
CREATE TRIGGER telegram_replacement_cleanup AFTER INSERT ON telegram_replacement_guards
BEGIN
 DELETE FROM telegram_replacement_guards WHERE rowid=NEW.rowid;
END;
CREATE TABLE resume_edit_guards(resume_id TEXT NOT NULL,owner_email TEXT NOT NULL,resume_revision TEXT NOT NULL,candidate_revision TEXT NOT NULL);
CREATE TRIGGER resume_edit_guard BEFORE INSERT ON resume_edit_guards
WHEN NOT EXISTS(SELECT 1 FROM resumes r JOIN candidates c ON c.id=r.candidate_id AND c.owner_email=r.owner_email WHERE r.id=NEW.resume_id AND r.owner_email=NEW.owner_email AND r.updated_at=NEW.resume_revision AND c.updated_at=NEW.candidate_revision AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='resume' AND ar.entity_id=r.id))
BEGIN
 SELECT RAISE(ABORT,'RESUME_EDIT_CHANGED');
END;
CREATE TRIGGER resume_edit_cleanup AFTER INSERT ON resume_edit_guards
BEGIN
 DELETE FROM resume_edit_guards WHERE rowid=NEW.rowid;
END;
