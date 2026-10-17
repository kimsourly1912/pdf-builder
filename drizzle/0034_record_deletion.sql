-- Retain previous pipeline archives in the shared Archive view.
INSERT OR IGNORE INTO archive_records(id,owner_email,entity_type,entity_id,label,group_id,archived_by,archived_at)
SELECT 'legacy-pipeline-'||id,owner_email,'hiring_pipeline',id,name,'legacy-pipeline-'||id,owner_email,updated_at FROM hiring_pipelines WHERE archived=1;
--> statement-breakpoint
CREATE TRIGGER archive_hiring_delete_dependency_guard BEFORE INSERT ON archive_transition_guards
WHEN NEW.action='delete' AND (
 (NEW.entity_type='hiring_application' AND EXISTS(SELECT 1 WHERE EXISTS(SELECT 1 FROM hiring_events WHERE application_id=NEW.entity_id AND kind<>'application_received') OR EXISTS(SELECT 1 FROM workflow_runs WHERE application_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM hiring_preparations WHERE application_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM hiring_application_forms WHERE application_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM form_assignments WHERE application_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM interview_processes WHERE application_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM hiring_applications WHERE id=NEW.entity_id AND (interview_id IS NOT NULL OR outcome IS NOT NULL OR offer<>'none' OR json_remove(evidence_json,'$.preparationMode','$.preparationModeSource')<>'{}'))))
 OR (NEW.entity_type='hiring_pipeline' AND EXISTS(SELECT 1 WHERE EXISTS(SELECT 1 FROM hiring_pipelines WHERE id=NEW.entity_id AND is_default=1) OR EXISTS(SELECT 1 FROM hiring_jobs j JOIN hiring_pipeline_versions v ON v.id=j.pipeline_version_id WHERE v.pipeline_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM hiring_applications a JOIN hiring_pipeline_versions v ON v.id=a.pipeline_version_id WHERE v.pipeline_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM workflows w JOIN hiring_pipeline_versions v ON instr(w.draft_json,v.id)>0 OR instr(coalesce(w.published_json,''),v.id)>0 WHERE v.pipeline_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM workflow_versions w JOIN hiring_pipeline_versions v ON instr(w.graph_json,v.id)>0 WHERE v.pipeline_id=NEW.entity_id)))
)
BEGIN SELECT RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED'); END;
--> statement-breakpoint
CREATE TRIGGER hiring_application_delete_guard BEFORE DELETE ON hiring_applications
WHEN NOT EXISTS(SELECT 1 FROM archive_records WHERE entity_type='hiring_application' AND entity_id=OLD.id AND owner_email=OLD.owner_email)
 OR EXISTS(SELECT 1 WHERE EXISTS(SELECT 1 FROM hiring_events WHERE application_id=OLD.id AND kind<>'application_received') OR EXISTS(SELECT 1 FROM workflow_runs WHERE application_id=OLD.id) OR EXISTS(SELECT 1 FROM hiring_preparations WHERE application_id=OLD.id) OR EXISTS(SELECT 1 FROM hiring_application_forms WHERE application_id=OLD.id) OR EXISTS(SELECT 1 FROM form_assignments WHERE application_id=OLD.id) OR EXISTS(SELECT 1 FROM interview_processes WHERE application_id=OLD.id) OR EXISTS(SELECT 1 FROM hiring_applications WHERE id=OLD.id AND (interview_id IS NOT NULL OR outcome IS NOT NULL OR offer<>'none' OR json_remove(evidence_json,'$.preparationMode','$.preparationModeSource')<>'{}')))
BEGIN
 -- The existing staging reset remains the sole bulk evidence-removal exception.
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id WHERE x.table_name='hiring_applications' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=OLD.owner_email AND g.check_passed=1)
 THEN RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED') END;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_pipeline_delete_guard BEFORE DELETE ON hiring_pipelines
WHEN NOT EXISTS(SELECT 1 FROM archive_records WHERE entity_type='hiring_pipeline' AND entity_id=OLD.id AND owner_email=OLD.owner_email)
 OR EXISTS(SELECT 1 WHERE EXISTS(SELECT 1 FROM hiring_pipelines WHERE id=OLD.id AND is_default=1) OR EXISTS(SELECT 1 FROM hiring_jobs j JOIN hiring_pipeline_versions v ON v.id=j.pipeline_version_id WHERE v.pipeline_id=OLD.id) OR EXISTS(SELECT 1 FROM hiring_applications a JOIN hiring_pipeline_versions v ON v.id=a.pipeline_version_id WHERE v.pipeline_id=OLD.id) OR EXISTS(SELECT 1 FROM workflows w JOIN hiring_pipeline_versions v ON instr(w.draft_json,v.id)>0 OR instr(coalesce(w.published_json,''),v.id)>0 WHERE v.pipeline_id=OLD.id) OR EXISTS(SELECT 1 FROM workflow_versions w JOIN hiring_pipeline_versions v ON instr(w.graph_json,v.id)>0 WHERE v.pipeline_id=OLD.id))
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id WHERE x.table_name='hiring_pipelines' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=OLD.owner_email AND g.check_passed=1)
 THEN RAISE(ABORT,'ARCHIVE_DEPENDENCY_PROTECTED') END;
END;
--> statement-breakpoint
DROP TRIGGER hiring_events_delete_guard;
--> statement-breakpoint
CREATE TRIGGER hiring_events_delete_guard BEFORE DELETE ON hiring_events
WHEN NOT EXISTS(SELECT 1 FROM test_data_reset_targets x JOIN test_data_reset_guards g ON g.id=x.reset_id WHERE x.table_name='hiring_events' AND x.row_key=CAST(OLD.rowid AS TEXT) AND g.owner_email=OLD.owner_email AND g.check_passed=1)
 AND NOT (OLD.kind='application_received'
   AND EXISTS(SELECT 1 FROM hiring_guards WHERE id='delete-application:'||OLD.application_id AND check_passed=1)
   AND EXISTS(SELECT 1 FROM archive_records WHERE entity_type='hiring_application' AND entity_id=OLD.application_id AND owner_email=OLD.owner_email))
BEGIN SELECT RAISE(ABORT,'Application history is append-only'); END;
