CREATE TABLE `submission_reviews` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`status` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`revision` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`correction_link_id` text,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`correction_link_id`) REFERENCES `recipient_links`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "submission_reviews_status_check" CHECK("submission_reviews"."status" IN ('accepted', 'corrections_requested'))
);
--> statement-breakpoint
CREATE INDEX `submission_reviews_owner_idx` ON `submission_reviews` (`owner_email`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `submission_reviews_correction_link_unique` ON `submission_reviews` (`correction_link_id`);
