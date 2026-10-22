CREATE TABLE `hiring_pipeline_references` (
	`id` text PRIMARY KEY NOT NULL,
	`pipeline_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`definition_json` text NOT NULL,
	FOREIGN KEY (`pipeline_id`) REFERENCES `hiring_pipelines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Retain old IDs for published workflow/run snapshots without retaining selectable copies.
INSERT INTO hiring_pipeline_references(id,pipeline_id,owner_email,definition_json)
SELECT v.id,v.pipeline_id,v.owner_email,v.definition_json FROM hiring_pipeline_versions v
JOIN hiring_pipelines p ON p.id=v.pipeline_id AND p.owner_email=v.owner_email
WHERE v.id<>p.current_version_id ORDER BY v.version DESC;
--> statement-breakpoint
UPDATE hiring_jobs SET pipeline_version_id=(SELECT p.current_version_id FROM hiring_pipeline_references r JOIN hiring_pipelines p ON p.id=r.pipeline_id AND p.owner_email=r.owner_email WHERE r.id=hiring_jobs.pipeline_version_id AND r.owner_email=hiring_jobs.owner_email)
WHERE EXISTS(SELECT 1 FROM hiring_pipeline_references r WHERE r.id=hiring_jobs.pipeline_version_id AND r.owner_email=hiring_jobs.owner_email);
--> statement-breakpoint
UPDATE hiring_applications SET pipeline_version_id=(SELECT p.current_version_id FROM hiring_pipeline_references r JOIN hiring_pipelines p ON p.id=r.pipeline_id AND p.owner_email=r.owner_email WHERE r.id=hiring_applications.pipeline_version_id AND r.owner_email=hiring_applications.owner_email)
WHERE EXISTS(SELECT 1 FROM hiring_pipeline_references r WHERE r.id=hiring_applications.pipeline_version_id AND r.owner_email=hiring_applications.owner_email);
--> statement-breakpoint
DELETE FROM hiring_pipeline_versions WHERE id IN (SELECT id FROM hiring_pipeline_references);
--> statement-breakpoint
DROP TRIGGER hiring_versions_immutable;
--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_pipeline_one_published` ON `hiring_pipeline_versions` (`pipeline_id`);
--> statement-breakpoint
CREATE VIEW hiring_pipeline_reference_ids AS
SELECT id,pipeline_id,owner_email FROM hiring_pipeline_versions
UNION ALL SELECT id,pipeline_id,owner_email FROM hiring_pipeline_references;
--> statement-breakpoint
-- These are operational references, not historical version records. Historical
-- workflow graphs and event payloads remain unchanged and resolve through aliases.
CREATE VIEW hiring_pipeline_stage_references AS
WITH graphs(owner_email,graph_json) AS (
 SELECT owner_email,draft_json FROM workflows w WHERE NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow' AND x.entity_id=w.id)
 UNION ALL SELECT owner_email,published_json FROM workflows w WHERE published_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow' AND x.entity_id=w.id)
 UNION ALL SELECT owner_email,graph_json FROM workflow_runs w WHERE status IN ('queued','running','waiting_review','failed') AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow_run' AND x.entity_id=w.id)
), graph_nodes AS (
 SELECT g.owner_email,r.pipeline_id,n.value FROM graphs g,json_each(g.graph_json,'$.nodes') n
 JOIN hiring_pipeline_reference_ids r ON r.id=COALESCE(NULLIF(json_extract(n.value,'$.config.pipelineVersionId'),''),(SELECT json_extract(start.value,'$.config.pipelineVersionId') FROM json_each(g.graph_json,'$.nodes') start WHERE json_extract(start.value,'$.kind')='resume_uploaded' LIMIT 1)) AND r.owner_email=g.owner_email
), graph_stages AS (
 SELECT owner_email,pipeline_id,json_extract(value,'$.config.stageId') stage_id FROM graph_nodes
 UNION SELECT owner_email,pipeline_id,json_extract(value,'$.config.fromStageId') FROM graph_nodes
 UNION SELECT owner_email,pipeline_id,json_extract(value,'$.config.value') FROM graph_nodes WHERE json_extract(value,'$.config.field')='stageId'
)
SELECT a.owner_email,v.pipeline_id,a.stage_id FROM hiring_applications a JOIN hiring_pipeline_versions v ON v.id=a.pipeline_version_id AND v.owner_email=a.owner_email
UNION SELECT a.owner_email,v.pipeline_id,r.stage_id FROM interview_rounds r JOIN interview_processes i ON i.id=r.process_id JOIN hiring_applications a ON a.id=i.application_id AND a.owner_email=i.owner_email JOIN hiring_pipeline_versions v ON v.id=a.pipeline_version_id AND v.owner_email=a.owner_email WHERE r.stage_id IS NOT NULL
UNION SELECT owner_email,pipeline_id,stage_id FROM graph_stages WHERE stage_id IS NOT NULL AND stage_id<>'';
--> statement-breakpoint
CREATE TRIGGER hiring_pipeline_referenced_stage_guard BEFORE UPDATE OF definition_json ON hiring_pipeline_versions
WHEN EXISTS(SELECT 1 FROM hiring_pipeline_stage_references r WHERE r.pipeline_id=OLD.pipeline_id AND r.owner_email=OLD.owner_email AND
 (EXISTS(SELECT 1 FROM json_each(OLD.definition_json,'$.stages') s WHERE json_extract(s.value,'$.id')=r.stage_id) OR EXISTS(SELECT 1 FROM hiring_pipeline_references a,json_each(a.definition_json,'$.stages') s WHERE a.pipeline_id=OLD.pipeline_id AND a.owner_email=OLD.owner_email AND json_extract(s.value,'$.id')=r.stage_id))
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.definition_json,'$.stages') s WHERE json_extract(s.value,'$.id')=r.stage_id))
BEGIN SELECT RAISE(ABORT,'HIRING_STAGE_IN_USE'); END;
--> statement-breakpoint
CREATE TRIGGER archive_hiring_pipeline_alias_guard BEFORE INSERT ON archive_transition_guards
WHEN NEW.action='delete' AND NEW.entity_type='hiring_pipeline' AND (
 EXISTS(SELECT 1 FROM workflows w JOIN hiring_pipeline_references r ON instr(w.draft_json,r.id)>0 OR instr(coalesce(w.published_json,''),r.id)>0 WHERE r.pipeline_id=NEW.entity_id)
 OR EXISTS(SELECT 1 FROM workflow_versions w JOIN hiring_pipeline_references r ON instr(w.graph_json,r.id)>0 WHERE r.pipeline_id=NEW.entity_id))
BEGIN SELECT RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED'); END;
--> statement-breakpoint
CREATE TRIGGER hiring_pipeline_alias_delete_guard BEFORE DELETE ON hiring_pipelines
WHEN (EXISTS(SELECT 1 FROM workflows w JOIN hiring_pipeline_references r ON instr(w.draft_json,r.id)>0 OR instr(coalesce(w.published_json,''),r.id)>0 WHERE r.pipeline_id=OLD.id)
 OR EXISTS(SELECT 1 FROM workflow_versions w JOIN hiring_pipeline_references r ON instr(w.graph_json,r.id)>0 WHERE r.pipeline_id=OLD.id))
 AND NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id WHERE x.table_name='hiring_pipelines' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=OLD.owner_email AND g.check_passed=1)
BEGIN SELECT RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED'); END;
