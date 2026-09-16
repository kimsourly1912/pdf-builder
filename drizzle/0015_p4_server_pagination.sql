CREATE INDEX IF NOT EXISTS `templates_owner_archived_updated_idx`
  ON `templates` (`owner_email`, `archived_at`, `updated_at`);

CREATE INDEX IF NOT EXISTS `resumes_owner_received_created_idx`
  ON `resumes` (`owner_email`, `received_date`, `created_at`);
