UPDATE `form_assignments`
SET
  `status` = 'cancelled',
  `updated_at` = COALESCE(
    (
      SELECT `templates`.`archived_at`
      FROM `templates`
      WHERE `templates`.`id` = `form_assignments`.`template_id`
    ),
    `updated_at`
  )
WHERE `status` = 'assigned'
  AND EXISTS (
    SELECT 1
    FROM `templates`
    WHERE `templates`.`id` = `form_assignments`.`template_id`
      AND `templates`.`archived_at` IS NOT NULL
  );
