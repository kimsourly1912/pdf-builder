ALTER TABLE `template_versions` ADD `roles_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `template_versions`
SET `roles_json` = COALESCE(
  (
    SELECT json_group_array(
      json_object(
        'id', `recipient_links`.`role_id`,
        'name', `recipient_links`.`role_name`,
        'color', `recipient_links`.`role_color`
      )
    )
    FROM `recipient_links`
    WHERE `recipient_links`.`template_id` = `template_versions`.`template_id`
  ),
  '[]'
);
