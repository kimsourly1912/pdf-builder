CREATE TABLE candidate_progress (
 candidate_id TEXT PRIMARY KEY NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
 owner_email TEXT NOT NULL, selected_resume_id TEXT, primary_run_id TEXT,
 manual_stage TEXT CONSTRAINT candidate_progress_stage_check CHECK(manual_stage IN ('new','reviewing','approved','awaiting_forms','ready')),
 basis_json TEXT, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
CREATE INDEX candidate_progress_owner_idx ON candidate_progress(owner_email);
CREATE TABLE candidate_progress_guards (
 owner_email TEXT NOT NULL,candidate_id TEXT NOT NULL,resume_id TEXT NOT NULL,
 candidate_revision TEXT NOT NULL,resume_revision TEXT NOT NULL,
 progress_version INTEGER NOT NULL,target_resume_id TEXT NOT NULL,target_run_id TEXT,run_id TEXT,run_revision TEXT,forms_json TEXT NOT NULL
);
CREATE TRIGGER candidate_progress_guard BEFORE INSERT ON candidate_progress_guards
WHEN NOT EXISTS (
 SELECT 1 FROM candidates c JOIN resumes r ON r.candidate_id=c.id AND r.owner_email=c.owner_email
 WHERE c.id=NEW.candidate_id AND c.owner_email=NEW.owner_email AND r.id=NEW.resume_id
 AND c.updated_at=NEW.candidate_revision AND r.updated_at=NEW.resume_revision
 AND EXISTS(SELECT 1 FROM resumes selected WHERE selected.id=NEW.target_resume_id AND selected.candidate_id=c.id AND selected.owner_email=c.owner_email AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='resume' AND ar.entity_id=selected.id) AND NOT EXISTS(SELECT 1 FROM telegram_intakes si JOIN archive_records ar ON ar.entity_type='intake' AND ar.entity_id=si.id WHERE si.resume_id=selected.id))
 AND (NEW.target_run_id IS NULL OR EXISTS(SELECT 1 FROM workflow_runs target WHERE target.id=NEW.target_run_id AND target.owner_email=c.owner_email AND target.resume_id=NEW.target_resume_id AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='workflow_run' AND ar.entity_id=target.id)))
 AND COALESCE((SELECT version FROM candidate_progress WHERE candidate_id=c.id AND owner_email=c.owner_email),0)=NEW.progress_version
 AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='resume' AND ar.entity_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM telegram_intakes i JOIN archive_records ar ON ar.entity_type='intake' AND ar.entity_id=i.id WHERE i.resume_id=r.id)
 AND (NEW.run_id IS NULL OR EXISTS(SELECT 1 FROM workflow_runs w WHERE w.id=NEW.run_id AND w.owner_email=c.owner_email AND w.resume_id=r.id AND w.updated_at=NEW.run_revision AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='workflow_run' AND ar.entity_id=w.id)))
)
OR EXISTS (
 SELECT 1 FROM json_each(NEW.forms_json) j LEFT JOIN form_assignments f ON f.id=json_extract(j.value,'$.id') LEFT JOIN recipient_links l ON l.id=f.recipient_link_id
 WHERE f.id IS NULL OR f.status<>json_extract(j.value,'$.status') OR f.updated_at<>json_extract(j.value,'$.updatedAt') OR l.status<>json_extract(j.value,'$.linkStatus') OR l.submission_count<>json_extract(j.value,'$.submissionCount')
)
BEGIN
 SELECT RAISE(ABORT,'CANDIDATE_PROGRESS_CHANGED');
END;
CREATE TRIGGER candidate_progress_guard_cleanup AFTER INSERT ON candidate_progress_guards
BEGIN
 DELETE FROM candidate_progress_guards WHERE rowid=NEW.rowid;
END;
