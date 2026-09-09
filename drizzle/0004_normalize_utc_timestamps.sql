UPDATE `templates`
SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z'
WHERE `created_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `templates`
SET `updated_at` = replace(`updated_at`, ' ', 'T') || '.000Z'
WHERE `updated_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `template_versions`
SET `published_at` = replace(`published_at`, ' ', 'T') || '.000Z'
WHERE `published_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `recipient_links`
SET `expires_at` = replace(`expires_at`, ' ', 'T') || '.000Z'
WHERE `expires_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `recipient_links`
SET `revoked_at` = replace(`revoked_at`, ' ', 'T') || '.000Z'
WHERE `revoked_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `recipient_links`
SET `completed_at` = replace(`completed_at`, ' ', 'T') || '.000Z'
WHERE `completed_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `recipient_links`
SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z'
WHERE `created_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `recipient_links`
SET `updated_at` = replace(`updated_at`, ' ', 'T') || '.000Z'
WHERE `updated_at` GLOB '????-??-?? ??:??:??';
--> statement-breakpoint
UPDATE `submissions`
SET `submitted_at` = replace(`submitted_at`, ' ', 'T') || '.000Z'
WHERE `submitted_at` GLOB '????-??-?? ??:??:??';
