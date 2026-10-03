CREATE TABLE `candidate_cv_reviews` (
	`resume_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`started_by` text NOT NULL,
	`started_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `candidate_cv_updates` (
	`resume_id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`base_resume_id` text NOT NULL,
	`status` text DEFAULT 'awaiting_confirmation' NOT NULL,
	`draft_json` text DEFAULT '{}' NOT NULL,
	`reason` text,
	`reviewed_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "candidate_cv_updates_status_check" CHECK("candidate_cv_updates"."status" IN ('awaiting_confirmation','pending','reviewing','accepted','declined','cancelled','replaced'))
);
--> statement-breakpoint
CREATE INDEX `candidate_cv_updates_owner_candidate_idx` ON `candidate_cv_updates` (`owner_email`,`candidate_id`);--> statement-breakpoint
CREATE TABLE candidate_cv_update_guards(resume_id TEXT NOT NULL,owner_email TEXT NOT NULL,revision TEXT NOT NULL,status TEXT NOT NULL);
CREATE TRIGGER candidate_cv_update_guard BEFORE INSERT ON candidate_cv_update_guards
WHEN NOT EXISTS(SELECT 1 FROM candidate_cv_updates u JOIN resumes r ON r.id=u.resume_id WHERE u.resume_id=NEW.resume_id AND u.owner_email=NEW.owner_email AND u.updated_at=NEW.revision AND u.status=NEW.status AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id) AND NOT EXISTS(SELECT 1 FROM telegram_intakes i JOIN archive_records a ON a.entity_type='intake' AND a.entity_id=i.id WHERE i.resume_id=r.id))
BEGIN SELECT RAISE(ABORT,'CV_UPDATE_CHANGED'); END;
CREATE TRIGGER candidate_cv_update_guard_cleanup AFTER INSERT ON candidate_cv_update_guards
BEGIN DELETE FROM candidate_cv_update_guards WHERE rowid=NEW.rowid; END;
DROP TRIGGER telegram_replacement_guard;
CREATE TRIGGER telegram_replacement_guard BEFORE INSERT ON telegram_replacement_guards
WHEN NOT EXISTS(SELECT 1 FROM resumes r WHERE r.id=NEW.resume_id AND r.owner_email=NEW.owner_email AND r.updated_at=NEW.resume_revision AND r.verification_status<>'verified' AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='resume' AND ar.entity_id=r.id))
OR EXISTS(SELECT 1 FROM candidate_cv_reviews h WHERE h.resume_id=NEW.resume_id)
OR EXISTS(SELECT 1 FROM candidate_progress p WHERE p.selected_resume_id=NEW.resume_id AND p.manual_stage='reviewing')
OR EXISTS(SELECT 1 FROM workflow_runs w WHERE w.resume_id=NEW.resume_id)
OR EXISTS(SELECT 1 FROM candidate_profile_versions v WHERE v.resume_id=NEW.resume_id)
OR EXISTS(SELECT 1 FROM candidates c JOIN resumes r ON r.candidate_id=c.id WHERE r.id=NEW.resume_id AND c.user_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'CV_REPLACEMENT_CHANGED'); END;
CREATE TRIGGER archive_cv_update_history_guard BEFORE INSERT ON archive_transition_guards
WHEN NEW.action='delete' AND NEW.entity_type='resume' AND EXISTS(SELECT 1 FROM candidate_cv_updates WHERE base_resume_id=NEW.entity_id OR (resume_id=NEW.entity_id AND status='accepted'))
BEGIN SELECT RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED'); END;
CREATE TABLE candidate_cv_initial_adoption_guards(owner_email TEXT NOT NULL,candidate_id TEXT NOT NULL,base_resume_id TEXT NOT NULL,progress_version INTEGER NOT NULL);
CREATE TRIGGER candidate_cv_initial_adoption_guard BEFORE INSERT ON candidate_cv_initial_adoption_guards
WHEN NOT EXISTS(SELECT 1 FROM candidates c JOIN resumes r ON r.candidate_id=c.id AND r.owner_email=c.owner_email WHERE c.id=NEW.candidate_id AND c.owner_email=NEW.owner_email AND r.id=NEW.base_resume_id AND c.user_id IS NULL AND r.verification_status<>'verified')
OR EXISTS(SELECT 1 FROM workflow_runs w LEFT JOIN resumes r ON r.id=w.resume_id WHERE w.owner_email=NEW.owner_email AND (r.candidate_id=NEW.candidate_id OR json_extract(w.context_json,'$.candidateId')=NEW.candidate_id))
OR COALESCE((SELECT version FROM candidate_progress WHERE candidate_id=NEW.candidate_id AND owner_email=NEW.owner_email),0)<>NEW.progress_version
OR EXISTS(SELECT 1 FROM candidate_progress WHERE candidate_id=NEW.candidate_id AND owner_email=NEW.owner_email AND selected_resume_id<>NEW.base_resume_id)
BEGIN SELECT RAISE(ABORT,'CV_UPDATE_CHANGED'); END;
CREATE TRIGGER candidate_cv_initial_adoption_guard_cleanup AFTER INSERT ON candidate_cv_initial_adoption_guards
BEGIN DELETE FROM candidate_cv_initial_adoption_guards WHERE rowid=NEW.rowid; END;
