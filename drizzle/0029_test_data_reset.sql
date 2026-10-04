CREATE TABLE `test_data_reset_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`check_passed` integer NOT NULL,
	CONSTRAINT "test_data_reset_checked" CHECK("test_data_reset_guards"."check_passed"=1)
);
--> statement-breakpoint
CREATE TABLE `test_data_reset_targets` (
	`reset_id` text NOT NULL,
	`table_name` text NOT NULL,
	`row_key` text NOT NULL,
	FOREIGN KEY (`reset_id`) REFERENCES `test_data_reset_guards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `test_data_reset_target_unique` ON `test_data_reset_targets` (`reset_id`,`table_name`,`row_key`);
--> statement-breakpoint
DROP TRIGGER submissions_preserve_evidence_before_delete;
--> statement-breakpoint
CREATE TRIGGER submissions_preserve_evidence_before_delete BEFORE DELETE ON submissions
WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id JOIN templates t ON t.id=OLD.template_id WHERE x.table_name='submissions' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=t.owner_email AND g.check_passed=1)
BEGIN SELECT RAISE(ABORT,'Completed submissions are immutable evidence'); END;
--> statement-breakpoint
DROP TRIGGER audit_events_prevent_delete;
--> statement-breakpoint
CREATE TRIGGER audit_events_prevent_delete BEFORE DELETE ON audit_events
WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id WHERE x.table_name='audit_events' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=OLD.owner_email AND g.check_passed=1)
BEGIN SELECT RAISE(ABORT,'audit_events are append-only'); END;
