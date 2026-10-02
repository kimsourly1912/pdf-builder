CREATE TABLE `recipient_links` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`role_id` text NOT NULL,
	`role_name` text NOT NULL,
	`role_color` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipient_links_token_hash_unique` ON `recipient_links` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `recipient_links_template_role_unique` ON `recipient_links` (`template_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `recipient_links_template_idx` ON `recipient_links` (`template_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`recipient_link_id` text NOT NULL,
	`recipient_name` text DEFAULT '' NOT NULL,
	`recipient_email` text DEFAULT '' NOT NULL,
	`values_json` text NOT NULL,
	`completed_file_key` text,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_link_id`) REFERENCES `recipient_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submissions_template_submitted_idx` ON `submissions` (`template_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`annotations_json` text NOT NULL,
	`page_order_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `templates_owner_updated_idx` ON `templates` (`owner_email`,`updated_at`);