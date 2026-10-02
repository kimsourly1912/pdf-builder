CREATE TABLE `audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_email` text NOT NULL,
  `actor_type` text NOT NULL,
  `actor_id` text,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `request_id` text,
  `metadata_json` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL
);

CREATE INDEX `audit_events_owner_created_idx`
  ON `audit_events` (`owner_email`, `created_at`);
CREATE INDEX `audit_events_target_created_idx`
  ON `audit_events` (`target_type`, `target_id`, `created_at`);
CREATE INDEX `audit_events_action_created_idx`
  ON `audit_events` (`action`, `created_at`);

CREATE TRIGGER `audit_events_prevent_update`
BEFORE UPDATE ON `audit_events`
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER `audit_events_prevent_delete`
BEFORE DELETE ON `audit_events`
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;
