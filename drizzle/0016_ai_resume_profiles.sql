ALTER TABLE `form_assignments` ADD `candidate_profile_version_id` text;
--> statement-breakpoint
ALTER TABLE `form_assignments` ADD `initial_values_meta_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE `candidate_profile_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`candidate_id` text NOT NULL,
	`resume_id` text,
	`extraction_id` text,
	`version_number` integer NOT NULL,
	`schema_version` integer DEFAULT 2 NOT NULL,
	`profile_json` text NOT NULL,
	`verification_status` text DEFAULT 'extracted' NOT NULL,
	`source` text NOT NULL,
	`created_by_email` text NOT NULL,
	`created_at` text NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`extraction_id`) REFERENCES `resume_extractions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_profile_versions_candidate_number_unique` ON `candidate_profile_versions` (`candidate_id`,`version_number`);
--> statement-breakpoint
CREATE INDEX `candidate_profile_versions_owner_candidate_idx` ON `candidate_profile_versions` (`owner_email`,`candidate_id`,`version_number`);
--> statement-breakpoint
CREATE INDEX `candidate_profile_versions_resume_idx` ON `candidate_profile_versions` (`resume_id`);
