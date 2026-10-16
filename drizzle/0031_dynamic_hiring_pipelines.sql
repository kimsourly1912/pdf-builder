CREATE TABLE `hiring_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`candidate_id` text NOT NULL,
	`resume_id` text NOT NULL,
	`job_id` text,
	`pipeline_version_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`intake` integer DEFAULT 0 NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`outcome` text,
	`hold` text,
	`offer` text DEFAULT 'none' NOT NULL,
	`interview_id` text,
	`stage_entered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`job_id`) REFERENCES `hiring_jobs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pipeline_version_id`) REFERENCES `hiring_pipeline_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "hiring_application_outcome_check" CHECK("hiring_applications"."outcome" IN ('hired','rejected','withdrawn')),
	CONSTRAINT "hiring_application_offer_check" CHECK("hiring_applications"."offer" IN ('none','draft','sent','accepted','declined'))
);
--> statement-breakpoint
CREATE INDEX `hiring_applications_owner_idx` ON `hiring_applications` (`owner_email`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_application_intake_unique` ON `hiring_applications` (`candidate_id`) WHERE "hiring_applications"."intake"=1;--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_application_job_unique` ON `hiring_applications` (`candidate_id`,`job_id`) WHERE "hiring_applications"."outcome" IS NULL AND "hiring_applications"."job_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `hiring_events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`kind` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`actor` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`context_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `hiring_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hiring_events_pending_idx` ON `hiring_events` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `hiring_events_application_idx` ON `hiring_events` (`application_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hiring_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`check_passed` integer NOT NULL,
	CONSTRAINT "hiring_checked" CHECK("hiring_guards"."check_passed"=1)
);
--> statement-breakpoint
CREATE TABLE `hiring_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`title` text NOT NULL,
	`pipeline_version_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`pipeline_version_id`) REFERENCES `hiring_pipeline_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `hiring_jobs_owner_idx` ON `hiring_jobs` (`owner_email`);--> statement-breakpoint
CREATE TABLE `hiring_pipeline_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`definition_json` text NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `hiring_pipelines`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_pipeline_version_unique` ON `hiring_pipeline_versions` (`pipeline_id`,`version`);--> statement-breakpoint
CREATE TABLE `hiring_pipelines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`draft_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`published_version` integer DEFAULT 0 NOT NULL,
	`current_version_id` text,
	`is_default` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hiring_pipelines_owner_idx` ON `hiring_pipelines` (`owner_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_pipeline_default_unique` ON `hiring_pipelines` (`owner_email`) WHERE "hiring_pipelines"."is_default"=1 AND "hiring_pipelines"."archived"=0;--> statement-breakpoint
CREATE TABLE `hiring_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`request_hash` text NOT NULL,
	`application_id` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `hiring_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hiring_receipts_application_idx` ON `hiring_receipts` (`application_id`);--> statement-breakpoint
DROP INDEX `workflow_runs_workflow_resume_unique`;--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `event_id` text;--> statement-breakpoint
ALTER TABLE `workflow_runs` ADD `application_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_event_unique` ON `workflow_runs` (`workflow_id`,`version`,`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_workflow_resume_unique` ON `workflow_runs` (`workflow_id`,`resume_id`) WHERE "workflow_runs"."event_id" IS NULL;
--> statement-breakpoint
CREATE TRIGGER hiring_intake_resume_insert AFTER INSERT ON resumes
WHEN NEW.candidate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates WHERE resume_id=NEW.id)
BEGIN
  INSERT OR IGNORE INTO hiring_applications(id,owner_email,candidate_id,resume_id,pipeline_version_id,stage_id,intake,stage_entered_at,created_at,updated_at)
  SELECT 'inbox_'||NEW.candidate_id,NEW.owner_email,NEW.candidate_id,NEW.id,v.id,json_extract(v.definition_json,'$.stages[0].id'),1,NEW.created_at,NEW.created_at,NEW.created_at
  FROM hiring_pipelines p JOIN hiring_pipeline_versions v ON v.id=p.current_version_id AND v.owner_email=p.owner_email JOIN candidates c ON c.id=NEW.candidate_id AND c.owner_email=p.owner_email
  WHERE p.owner_email=NEW.owner_email AND p.is_default=1 AND p.archived=0;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_intake_resume_link AFTER UPDATE OF candidate_id ON resumes
WHEN NEW.candidate_id IS NOT NULL AND OLD.candidate_id IS NULL AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates WHERE resume_id=NEW.id)
BEGIN
  INSERT OR IGNORE INTO hiring_applications(id,owner_email,candidate_id,resume_id,pipeline_version_id,stage_id,intake,stage_entered_at,created_at,updated_at)
  SELECT 'inbox_'||NEW.candidate_id,NEW.owner_email,NEW.candidate_id,NEW.id,v.id,json_extract(v.definition_json,'$.stages[0].id'),1,NEW.updated_at,NEW.updated_at,NEW.updated_at
  FROM hiring_pipelines p JOIN hiring_pipeline_versions v ON v.id=p.current_version_id AND v.owner_email=p.owner_email JOIN candidates c ON c.id=NEW.candidate_id AND c.owner_email=p.owner_email
  WHERE p.owner_email=NEW.owner_email AND p.is_default=1 AND p.archived=0;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_intake_application_event AFTER INSERT ON hiring_applications
WHEN NEW.intake=1 AND NEW.id='inbox_'||NEW.candidate_id
BEGIN
  INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
  SELECT lower(hex(randomblob(16))),NEW.id,NEW.owner_email,'application_received',NEW.stage_id,'intake',json_object('pipelineVersionId',NEW.pipeline_version_id,'jobId',NEW.job_id,'stageId',NEW.stage_id,'fromStageId',NULL,'applicationRevision',NEW.revision,'chain',json('[]'),'source',r.source,'appliedPosition',r.applied_position),NEW.created_at
  FROM resumes r WHERE r.id=NEW.resume_id AND r.owner_email=NEW.owner_email;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_cv_approved_event AFTER UPDATE OF verification_status ON resumes
WHEN NEW.verification_status='verified' AND OLD.verification_status<>'verified' AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates WHERE resume_id=NEW.id)
BEGIN
  INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
  SELECT lower(hex(randomblob(16))),a.id,a.owner_email,'application_cv_approved',a.stage_id,a.owner_email,json_object('pipelineVersionId',a.pipeline_version_id,'jobId',a.job_id,'stageId',a.stage_id,'fromStageId',NULL,'applicationRevision',a.revision,'chain',json('[]'),'source',NEW.source,'appliedPosition',NEW.applied_position),NEW.updated_at
  FROM hiring_applications a WHERE a.resume_id=NEW.id AND a.candidate_id=NEW.candidate_id AND a.owner_email=NEW.owner_email AND a.outcome IS NULL;
END;

--> statement-breakpoint
CREATE TRIGGER hiring_versions_immutable BEFORE UPDATE ON hiring_pipeline_versions
BEGIN SELECT RAISE(ABORT,'Published hiring models are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER hiring_events_immutable BEFORE UPDATE OF id,application_id,owner_email,kind,from_stage,to_stage,actor,reason,context_json,created_at ON hiring_events
BEGIN SELECT RAISE(ABORT,'Application history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER hiring_events_delete_guard BEFORE DELETE ON hiring_events
WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id WHERE x.table_name='hiring_events' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=OLD.owner_email AND g.check_passed=1)
BEGIN SELECT RAISE(ABORT,'Application history is append-only'); END;

--> statement-breakpoint
CREATE TRIGGER hiring_protect_cv_replacement BEFORE INSERT ON telegram_replacement_guards
WHEN EXISTS(SELECT 1 FROM hiring_applications WHERE resume_id=NEW.resume_id AND owner_email=NEW.owner_email)
BEGIN SELECT RAISE(ABORT,'CV_REPLACEMENT_CHANGED'); END;
