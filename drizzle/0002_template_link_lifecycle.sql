CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`annotations_json` text NOT NULL,
	`page_order_json` text NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_template_number_unique` ON `template_versions` (`template_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `template_versions_template_idx` ON `template_versions` (`template_id`);--> statement-breakpoint
INSERT INTO `template_versions` (`id`, `template_id`, `version_number`, `file_key`, `file_name`, `annotations_json`, `page_order_json`, `published_at`)
SELECT 'version:' || `id`, `id`, 1, `file_key`, `file_name`, `annotations_json`, `page_order_json`, `created_at`
FROM `templates`;--> statement-breakpoint
ALTER TABLE `templates` ADD `current_version_id` text;--> statement-breakpoint
UPDATE `templates` SET `current_version_id` = 'version:' || `id`;--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `template_version_id` text;--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `max_submissions` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `submission_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `updated_at` text;--> statement-breakpoint
UPDATE `recipient_links`
SET `template_version_id` = 'version:' || `template_id`,
    `submission_count` = (SELECT COUNT(*) FROM `submissions` WHERE `submissions`.`recipient_link_id` = `recipient_links`.`id`),
    `status` = CASE WHEN EXISTS (SELECT 1 FROM `submissions` WHERE `submissions`.`recipient_link_id` = `recipient_links`.`id`) THEN 'completed' ELSE `status` END,
    `completed_at` = (SELECT MAX(`submitted_at`) FROM `submissions` WHERE `submissions`.`recipient_link_id` = `recipient_links`.`id`),
    `updated_at` = `created_at`;--> statement-breakpoint
ALTER TABLE `submissions` ADD `template_version_id` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `idempotency_key` text;--> statement-breakpoint
UPDATE `submissions` SET `template_version_id` = 'version:' || `template_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_link_idempotency_unique` ON `submissions` (`recipient_link_id`,`idempotency_key`);
