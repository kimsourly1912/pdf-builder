CREATE TABLE `storage_cleanup_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`reason` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `storage_cleanup_jobs_object_key_unique` ON `storage_cleanup_jobs` (`object_key`);
--> statement-breakpoint
CREATE INDEX `storage_cleanup_jobs_updated_idx` ON `storage_cleanup_jobs` (`updated_at`);
