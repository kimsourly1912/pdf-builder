CREATE TABLE `ai_field_detection_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`page_count` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`result_json` text,
	`reviewed_candidates_json` text,
	`provider_response_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`reviewed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_field_detection_runs_owner_updated_idx` ON `ai_field_detection_runs` (`owner_email`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `ai_field_detection_runs_status_updated_idx` ON `ai_field_detection_runs` (`status`,`updated_at`);
