CREATE TABLE `interview_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`submission_id` text NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `interview_processes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assignment_id`) REFERENCES `form_assignments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_document_assignment_unique` ON `interview_documents` (`process_id`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `interview_events` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`mutation_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `interview_processes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_event_mutation_unique` ON `interview_events` (`process_id`,`mutation_id`);--> statement-breakpoint
CREATE TABLE `interview_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`interviewer` text NOT NULL,
	`status` text NOT NULL,
	`scorecard_json` text NOT NULL,
	`entered_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `interview_rounds`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "interview_feedback_status_check" CHECK("interview_feedback"."status" IN ('draft','submitted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_feedback_interviewer_unique` ON `interview_feedback` (`round_id`,`interviewer`);--> statement-breakpoint
CREATE TABLE `interview_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`check_passed` integer NOT NULL,
	CONSTRAINT "interview_checked" CHECK("interview_guards"."check_passed"=1)
);
--> statement-breakpoint
CREATE TABLE `interview_processes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`candidate_id` text NOT NULL,
	`resume_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`run_id` text,
	`account_id` text,
	`position` text NOT NULL,
	`responsible` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`rounds_complete` integer DEFAULT 0 NOT NULL,
	`outcome` text,
	`decision_reason` text DEFAULT '' NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`hold_json` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`profile_id`) REFERENCES `candidate_profile_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "interview_outcome_check" CHECK("interview_processes"."outcome" IN ('passed','not_selected','withdrawn'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_candidate_unique` ON `interview_processes` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `interview_owner_updated_idx` ON `interview_processes` (`owner_email`,`updated_at`);--> statement-breakpoint
CREATE TABLE `interview_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`process_id` text NOT NULL,
	`name` text NOT NULL,
	`interviewers_json` text NOT NULL,
	`status` text NOT NULL,
	`appointment_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`process_id`) REFERENCES `interview_processes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "interview_round_status_check" CHECK("interview_rounds"."status" IN ('scheduled','cancelled','completed','no_show'))
);
--> statement-breakpoint
CREATE INDEX `interview_round_process_idx` ON `interview_rounds` (`process_id`);
--> statement-breakpoint
CREATE TRIGGER interview_events_immutable_update BEFORE UPDATE ON interview_events
BEGIN SELECT RAISE(ABORT,'Interview history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER interview_events_immutable_delete BEFORE DELETE ON interview_events
WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id JOIN interview_processes p ON p.id=OLD.process_id WHERE x.table_name='interview_events' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=p.owner_email AND g.check_passed=1)
BEGIN SELECT RAISE(ABORT,'Interview history is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER interview_snapshot_immutable BEFORE UPDATE OF candidate_id,resume_id,profile_id,run_id,account_id,snapshot_json,owner_email,created_by,created_at ON interview_processes
BEGIN SELECT RAISE(ABORT,'Original accepted interview context is immutable'); END;
