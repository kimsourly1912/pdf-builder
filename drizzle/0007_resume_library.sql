ALTER TABLE `form_assignments` ADD `initial_values_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE `candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_email` text NOT NULL,
  `user_id` text REFERENCES `user`(`id`) ON DELETE set null,
  `full_name` text DEFAULT '' NOT NULL,
  `first_name` text DEFAULT '' NOT NULL,
  `last_name` text DEFAULT '' NOT NULL,
  `email` text DEFAULT '' NOT NULL,
  `normalized_email` text DEFAULT '' NOT NULL,
  `phone` text DEFAULT '' NOT NULL,
  `normalized_phone` text DEFAULT '' NOT NULL,
  `address` text DEFAULT '' NOT NULL,
  `date_of_birth` text,
  `gender` text DEFAULT '' NOT NULL,
  `nationality` text DEFAULT '' NOT NULL,
  `current_title` text DEFAULT '' NOT NULL,
  `professional_summary` text DEFAULT '' NOT NULL,
  `skills_json` text DEFAULT '[]' NOT NULL,
  `work_experience_json` text DEFAULT '[]' NOT NULL,
  `education_json` text DEFAULT '[]' NOT NULL,
  `certifications_json` text DEFAULT '[]' NOT NULL,
  `languages_json` text DEFAULT '[]' NOT NULL,
  `links_json` text DEFAULT '[]' NOT NULL,
  `verification_status` text DEFAULT 'extracted' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidates_user_unique` ON `candidates` (`user_id`);
--> statement-breakpoint
CREATE INDEX `candidates_owner_updated_idx` ON `candidates` (`owner_email`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `candidates_owner_email_idx` ON `candidates` (`owner_email`, `normalized_email`);
--> statement-breakpoint
CREATE INDEX `candidates_owner_phone_idx` ON `candidates` (`owner_email`, `normalized_phone`);
--> statement-breakpoint
CREATE TABLE `resumes` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_email` text NOT NULL,
  `candidate_id` text REFERENCES `candidates`(`id`) ON DELETE set null,
  `duplicate_candidate_id` text REFERENCES `candidates`(`id`) ON DELETE set null,
  `file_key` text NOT NULL,
  `file_name` text NOT NULL,
  `file_size` integer NOT NULL,
  `content_type` text NOT NULL,
  `checksum` text NOT NULL,
  `page_count` integer NOT NULL,
  `source` text NOT NULL,
  `applied_position` text DEFAULT '' NOT NULL,
  `received_date` text NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `status` text NOT NULL,
  `error_message` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_file_key_unique` ON `resumes` (`file_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `resumes_owner_checksum_unique` ON `resumes` (`owner_email`, `checksum`);
--> statement-breakpoint
CREATE INDEX `resumes_owner_status_updated_idx` ON `resumes` (`owner_email`, `status`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `resumes_owner_source_received_idx` ON `resumes` (`owner_email`, `source`, `received_date`);
--> statement-breakpoint
CREATE INDEX `resumes_candidate_idx` ON `resumes` (`candidate_id`);
--> statement-breakpoint
CREATE TABLE `resume_extractions` (
  `id` text PRIMARY KEY NOT NULL,
  `resume_id` text NOT NULL REFERENCES `resumes`(`id`) ON DELETE cascade,
  `version_number` integer NOT NULL,
  `engine` text NOT NULL,
  `status` text NOT NULL,
  `fields_json` text NOT NULL,
  `page_count` integer NOT NULL,
  `scanned_page_count` integer NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_extractions_version_unique` ON `resume_extractions` (`resume_id`, `version_number`);
--> statement-breakpoint
CREATE INDEX `resume_extractions_resume_idx` ON `resume_extractions` (`resume_id`);
--> statement-breakpoint
CREATE TABLE `candidate_resume_links` (
  `id` text PRIMARY KEY NOT NULL,
  `candidate_id` text NOT NULL REFERENCES `candidates`(`id`) ON DELETE cascade,
  `resume_id` text NOT NULL REFERENCES `resumes`(`id`) ON DELETE cascade,
  `link_type` text NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_resume_links_resume_unique` ON `candidate_resume_links` (`resume_id`);
--> statement-breakpoint
CREATE INDEX `candidate_resume_links_candidate_idx` ON `candidate_resume_links` (`candidate_id`);
--> statement-breakpoint
CREATE TABLE `resume_processing_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `resume_id` text NOT NULL REFERENCES `resumes`(`id`) ON DELETE cascade,
  `attempt_number` integer NOT NULL,
  `status` text NOT NULL,
  `error_code` text,
  `started_at` text NOT NULL,
  `completed_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resume_processing_jobs_attempt_unique` ON `resume_processing_jobs` (`resume_id`, `attempt_number`);
--> statement-breakpoint
CREATE INDEX `resume_processing_jobs_resume_idx` ON `resume_processing_jobs` (`resume_id`);
