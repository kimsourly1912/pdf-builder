CREATE TABLE `workflow_versions` (
	`workflow_id` text NOT NULL,
	`version` integer NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`graph_json` text NOT NULL,
	`published_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_versions_unique` ON `workflow_versions` (`workflow_id`,`version`);
--> statement-breakpoint
INSERT INTO workflow_versions (workflow_id, version, owner_email, name, graph_json, published_at)
SELECT id, version, owner_email, name, published_json, updated_at FROM workflows WHERE published_json IS NOT NULL AND version > 0;
--> statement-breakpoint
CREATE TRIGGER workflow_publication_history AFTER UPDATE OF version ON workflows
WHEN NEW.version > OLD.version AND NEW.published_json IS NOT NULL
BEGIN
  INSERT INTO workflow_versions (workflow_id, version, owner_email, name, graph_json, published_at)
  VALUES (NEW.id, NEW.version, NEW.owner_email, NEW.name, NEW.published_json, NEW.updated_at);
END;
