DROP INDEX `interview_candidate_unique`;--> statement-breakpoint
ALTER TABLE `interview_processes` ADD `application_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `interview_application_unique` ON `interview_processes` (`application_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `interview_candidate_unique` ON `interview_processes` (`candidate_id`) WHERE "interview_processes"."application_id" IS NULL;