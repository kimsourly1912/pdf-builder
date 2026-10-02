ALTER TABLE `form_assignments` DROP COLUMN `access_token`;
--> statement-breakpoint
ALTER TABLE `submissions` ADD `completed_file_checksum` text;
--> statement-breakpoint
ALTER TABLE `submissions` ADD `artifact_generator` text DEFAULT 'legacy-client-v1' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `submissions_preserve_evidence_before_delete`
BEFORE DELETE ON `submissions`
BEGIN
  SELECT RAISE(ABORT, 'Completed submissions are immutable evidence');
END;
--> statement-breakpoint
CREATE TRIGGER `templates_preserve_evidence_before_delete`
BEFORE DELETE ON `templates`
WHEN EXISTS (
  SELECT 1 FROM `submissions` WHERE `template_id` = OLD.`id`
) OR EXISTS (
  SELECT 1 FROM `form_assignments` WHERE `template_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'Archive templates that have assignments or submissions');
END;
--> statement-breakpoint
CREATE TRIGGER `recipient_links_preserve_evidence_before_delete`
BEFORE DELETE ON `recipient_links`
WHEN EXISTS (
  SELECT 1 FROM `submissions` WHERE `recipient_link_id` = OLD.`id`
) OR EXISTS (
  SELECT 1 FROM `form_assignments` WHERE `recipient_link_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'Recipient links with evidence cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `users_preserve_assignments_before_delete`
BEFORE DELETE ON `user`
WHEN EXISTS (
  SELECT 1 FROM `form_assignments` WHERE `user_id` = OLD.`id`
) OR EXISTS (
  SELECT 1 FROM `recipient_links` WHERE `assigned_user_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'Deactivate accounts that have assigned forms');
END;
