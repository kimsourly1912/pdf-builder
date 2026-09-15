CREATE INDEX IF NOT EXISTS `recipient_links_template_assignee_idx`
  ON `recipient_links` (`template_id`, `assigned_user_id`);

CREATE INDEX IF NOT EXISTS `recipient_profiles_creator_created_idx`
  ON `recipient_profiles` (`created_by_email`, `created_at`);

CREATE INDEX IF NOT EXISTS `form_assignments_user_assigned_idx`
  ON `form_assignments` (`user_id`, `assigned_at`);

CREATE INDEX IF NOT EXISTS `submissions_link_submitted_idx`
  ON `submissions` (`recipient_link_id`, `submitted_at`);
