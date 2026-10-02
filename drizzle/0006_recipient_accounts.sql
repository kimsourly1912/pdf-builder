ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `user` ADD `ban_reason` text;
--> statement-breakpoint
ALTER TABLE `user` ADD `ban_expires` integer;
--> statement-breakpoint
ALTER TABLE `session` ADD `impersonated_by` text;
--> statement-breakpoint
UPDATE `user`
SET `role` = 'admin'
WHERE lower(`email`) IN ('kimsur61@gmail.com', 'owner@localhost');
--> statement-breakpoint
DROP INDEX `recipient_links_template_role_unique`;
--> statement-breakpoint
ALTER TABLE `recipient_links` ADD `assigned_user_id` text REFERENCES `user`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX `recipient_links_template_role_public_unique`
ON `recipient_links` (`template_id`, `role_id`)
WHERE `assigned_user_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `recipient_links_assigned_user_idx` ON `recipient_links` (`assigned_user_id`);
--> statement-breakpoint
CREATE TABLE `recipient_profiles` (
  `user_id` text PRIMARY KEY NOT NULL,
  `account_type` text NOT NULL,
  `must_change_password` integer DEFAULT true NOT NULL,
  `created_by_email` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipient_profiles_type_idx` ON `recipient_profiles` (`account_type`);
--> statement-breakpoint
CREATE TABLE `form_assignments` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `template_id` text NOT NULL,
  `template_version_id` text NOT NULL,
  `recipient_link_id` text NOT NULL,
  `role_id` text NOT NULL,
  `role_name` text NOT NULL,
  `role_color` text NOT NULL,
  `access_token` text NOT NULL,
  `status` text DEFAULT 'assigned' NOT NULL,
  `assigned_at` text NOT NULL,
  `completed_at` text,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`recipient_link_id`) REFERENCES `recipient_links`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_assignments_link_unique` ON `form_assignments` (`recipient_link_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_assignments_user_version_role_unique`
ON `form_assignments` (`user_id`, `template_version_id`, `role_id`);
--> statement-breakpoint
CREATE INDEX `form_assignments_user_status_idx` ON `form_assignments` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `form_assignments_template_idx` ON `form_assignments` (`template_id`);
