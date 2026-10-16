CREATE TABLE `hiring_application_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`provenance` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `hiring_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `form_assignments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hiring_application_form_unique` ON `hiring_application_forms` (`application_id`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `hiring_preparations` (
	`run_id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`resume_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`application_id`) REFERENCES `hiring_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `hiring_preparations_application_idx` ON `hiring_preparations` (`application_id`);--> statement-breakpoint
DROP INDEX `form_assignments_user_version_role_unique`;--> statement-breakpoint
ALTER TABLE `form_assignments` ADD `application_id` text REFERENCES hiring_applications(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `form_assignments_application_unique` ON `form_assignments` (`application_id`,`template_version_id`,`role_id`) WHERE "form_assignments"."application_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `form_assignments_user_version_role_unique` ON `form_assignments` (`user_id`,`template_version_id`,`role_id`) WHERE "form_assignments"."application_id" IS NULL;--> statement-breakpoint
DROP INDEX `workflow_runs_workflow_resume_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_application_preparation_unique` ON `workflow_runs` (`workflow_id`,`application_id`,`resume_id`) WHERE "workflow_runs"."event_id" IS NULL AND "workflow_runs"."application_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_runs_workflow_resume_unique` ON `workflow_runs` (`workflow_id`,`resume_id`) WHERE "workflow_runs"."event_id" IS NULL AND "workflow_runs"."application_id" IS NULL;--> statement-breakpoint
ALTER TABLE `interview_rounds` ADD `stage_id` text;
--> statement-breakpoint
CREATE TRIGGER hiring_preparation_scope BEFORE INSERT ON workflow_runs
WHEN NEW.application_id IS NOT NULL AND NEW.event_id IS NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hiring_applications a WHERE a.id=NEW.application_id AND a.owner_email=NEW.owner_email AND a.resume_id=NEW.resume_id AND a.outcome IS NULL AND a.hold IS NULL)
    THEN RAISE(ABORT,'hiring_checked: application preparation changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_legacy_approval_scope BEFORE INSERT ON workflow_runs
WHEN NEW.application_id IS NULL AND NEW.event_id IS NULL
 AND EXISTS(SELECT 1 FROM json_each(NEW.graph_json,'$.nodes') n WHERE json_extract(n.value,'$.kind')='resume_uploaded' AND json_extract(n.value,'$.config.trigger')='resume_verified')
 AND EXISTS(SELECT 1 FROM hiring_applications a WHERE a.owner_email=NEW.owner_email AND a.resume_id=NEW.resume_id AND a.outcome IS NULL AND json_extract(a.evidence_json,'$.preparationMode')='application')
BEGIN SELECT RAISE(IGNORE); END;
--> statement-breakpoint
CREATE TRIGGER hiring_legacy_evidence_registered AFTER INSERT ON hiring_applications
WHEN json_array_length(json_extract(NEW.evidence_json,'$.assignments'))>0
BEGIN
  INSERT OR IGNORE INTO hiring_application_forms(id,application_id,assignment_id,provenance,created_at)
  SELECT lower(hex(randomblob(16))),NEW.id,f.id,'legacy_link',NEW.created_at FROM form_assignments f JOIN json_each(NEW.evidence_json,'$.assignments') j ON f.id=j.value;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_preparation_registered AFTER INSERT ON workflow_runs
WHEN NEW.application_id IS NOT NULL AND NEW.event_id IS NULL
BEGIN
  INSERT INTO hiring_preparations(run_id,application_id,owner_email,resume_id,created_at) VALUES(NEW.id,NEW.application_id,NEW.owner_email,NEW.resume_id,NEW.created_at);
  UPDATE hiring_applications SET evidence_json=json_set(evidence_json,'$.runId',NEW.id,'$.preparationMode','application','$.preparationModeSource','preparation'),revision=revision+1,updated_at=NEW.created_at WHERE id=NEW.application_id;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_form_scope BEFORE INSERT ON form_assignments
WHEN NEW.application_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hiring_applications a JOIN candidates c ON c.id=a.candidate_id AND c.owner_email=a.owner_email JOIN recipient_profiles p ON p.user_id=c.user_id AND p.created_by_email=a.owner_email JOIN templates t ON t.id=NEW.template_id AND t.owner_email=a.owner_email WHERE a.id=NEW.application_id AND c.user_id=NEW.user_id AND a.outcome IS NULL AND a.hold IS NULL)
    THEN RAISE(ABORT,'hiring_checked: assignment application changed') END;
END;
--> statement-breakpoint
CREATE TRIGGER hiring_form_registered AFTER INSERT ON form_assignments
WHEN NEW.application_id IS NOT NULL
BEGIN
  INSERT INTO hiring_application_forms(id,application_id,assignment_id,provenance,created_at) VALUES(lower(hex(randomblob(16))),NEW.application_id,NEW.id,'created',NEW.assigned_at);
  UPDATE hiring_applications SET evidence_json=json_set(evidence_json,'$.assignments',json(COALESCE((SELECT json_group_array(assignment_id) FROM hiring_application_forms WHERE application_id=NEW.application_id),'[]'))),revision=revision+1,updated_at=NEW.assigned_at WHERE id=NEW.application_id;
END;
--> statement-breakpoint
INSERT OR IGNORE INTO hiring_application_forms(id,application_id,assignment_id,provenance,created_at)
SELECT lower(hex(randomblob(16))),a.id,f.id,'legacy_link',a.created_at FROM hiring_applications a,json_each(a.evidence_json,'$.assignments') j JOIN form_assignments f ON f.id=j.value;
--> statement-breakpoint
CREATE TRIGGER hiring_preparation_effect_guard BEFORE INSERT ON workflow_execution_guards
WHEN EXISTS(SELECT 1 FROM workflow_runs w WHERE w.id=NEW.run_id AND w.application_id IS NOT NULL AND w.event_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM hiring_applications a WHERE a.id=w.application_id AND a.owner_email=w.owner_email AND a.resume_id=w.resume_id AND a.hold IS NULL AND a.outcome IS NULL))
BEGIN SELECT RAISE(ABORT,'WORKFLOW_LEASE_CHANGED'); END;
--> statement-breakpoint
CREATE TRIGGER hiring_preparation_review_guard BEFORE INSERT ON workflow_review_decisions
WHEN EXISTS(SELECT 1 FROM workflow_runs w WHERE w.id=NEW.run_id AND w.application_id IS NOT NULL AND w.event_id IS NULL
  AND NOT EXISTS(SELECT 1 FROM hiring_applications a WHERE a.id=w.application_id AND a.owner_email=w.owner_email AND a.resume_id=w.resume_id AND a.hold IS NULL AND a.outcome IS NULL))
BEGIN SELECT RAISE(ABORT,'WORKFLOW_REVIEW_CHANGED'); END;

--> statement-breakpoint
CREATE TRIGGER hiring_forms_submitted_event AFTER UPDATE OF status ON form_assignments WHEN NEW.status='completed' AND OLD.status<>'completed'
BEGIN
 INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
 SELECT lower(hex(randomblob(16))),a.id,a.owner_email,'application_forms_submitted',a.stage_id,'activity',json_object('pipelineVersionId',a.pipeline_version_id,'jobId',a.job_id,'stageId',a.stage_id,'fromStageId',NULL,'applicationRevision',a.revision,'chain',json('[]'),'source',r.source,'appliedPosition',r.applied_position),NEW.updated_at
 FROM hiring_applications a JOIN resumes r ON r.id=a.resume_id AND r.owner_email=a.owner_email WHERE NEW.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments')) AND EXISTS(SELECT 1 FROM form_assignments f WHERE f.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments'))) AND NOT EXISTS(SELECT 1 FROM form_assignments f WHERE f.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments')) AND f.status<>'completed');
END;

--> statement-breakpoint
CREATE TRIGGER hiring_forms_accepted_event AFTER INSERT ON submission_reviews WHEN NEW.status='accepted'
BEGIN
 INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
 SELECT lower(hex(randomblob(16))),a.id,a.owner_email,'application_forms_accepted',a.stage_id,'activity',json_object('pipelineVersionId',a.pipeline_version_id,'jobId',a.job_id,'stageId',a.stage_id,'fromStageId',NULL,'applicationRevision',a.revision,'chain',json('[]'),'source',r.source,'appliedPosition',r.applied_position),NEW.reviewed_at
 FROM hiring_applications a JOIN resumes r ON r.id=a.resume_id AND r.owner_email=a.owner_email WHERE EXISTS(SELECT 1 FROM hiring_application_forms af JOIN form_assignments f ON f.id=af.assignment_id JOIN submissions sub ON sub.recipient_link_id=f.recipient_link_id WHERE af.application_id=a.id AND f.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments')) AND sub.id=NEW.submission_id) AND EXISTS(SELECT 1 FROM form_assignments f WHERE f.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments'))) AND NOT EXISTS(SELECT 1 FROM form_assignments f WHERE f.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments')) AND f.status<>'completed') AND NOT EXISTS(SELECT 1 FROM form_assignments f WHERE f.id IN (SELECT value FROM json_each(a.evidence_json,'$.assignments')) AND NOT EXISTS(SELECT 1 FROM submissions sub JOIN submission_reviews h ON h.submission_id=sub.id AND h.owner_email=a.owner_email AND h.reviewed_by=a.owner_email AND h.status='accepted' WHERE sub.recipient_link_id=f.recipient_link_id AND sub.id=(SELECT id FROM submissions WHERE recipient_link_id=f.recipient_link_id ORDER BY submitted_at DESC,id DESC LIMIT 1)));
END;

--> statement-breakpoint
CREATE TRIGGER hiring_preparation_completed_event AFTER UPDATE OF status ON workflow_runs WHEN NEW.status='completed' AND OLD.status<>'completed' AND NEW.event_id IS NULL AND NEW.application_id IS NOT NULL
BEGIN
 INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
 SELECT lower(hex(randomblob(16))),a.id,a.owner_email,'application_preparation_completed',a.stage_id,'activity',json_object('pipelineVersionId',a.pipeline_version_id,'jobId',a.job_id,'stageId',a.stage_id,'fromStageId',NULL,'applicationRevision',a.revision,'chain',json(COALESCE(json_extract(NEW.context_json,'$.applicationChain'),'[]')),'source',r.source,'appliedPosition',r.applied_position),NEW.updated_at
 FROM hiring_applications a JOIN resumes r ON r.id=a.resume_id AND r.owner_email=a.owner_email WHERE a.id=NEW.application_id AND a.owner_email=NEW.owner_email AND json_extract(a.evidence_json,'$.runId')=NEW.id;
END;

--> statement-breakpoint
CREATE TRIGGER hiring_interview_decision_event AFTER INSERT ON interview_events WHEN NEW.action IN ('decide','correct_decision','withdraw')
BEGIN
 INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
 SELECT lower(hex(randomblob(16))),a.id,a.owner_email,'application_interview_decided',a.stage_id,'activity',json_object('pipelineVersionId',a.pipeline_version_id,'jobId',a.job_id,'stageId',a.stage_id,'fromStageId',NULL,'applicationRevision',a.revision,'chain',json('[]'),'source',r.source,'appliedPosition',r.applied_position),NEW.created_at
 FROM hiring_applications a JOIN resumes r ON r.id=a.resume_id AND r.owner_email=a.owner_email WHERE a.interview_id=NEW.process_id;
END;

--> statement-breakpoint
CREATE TRIGGER hiring_interview_feedback_event AFTER INSERT ON interview_events WHEN NEW.action='feedback' AND json_extract(NEW.details_json,'$.status')='submitted'
BEGIN
 INSERT INTO hiring_events(id,application_id,owner_email,kind,to_stage,actor,context_json,created_at)
 SELECT lower(hex(randomblob(16))),a.id,a.owner_email,'application_interview_ready',a.stage_id,'activity',json_object('pipelineVersionId',a.pipeline_version_id,'jobId',a.job_id,'stageId',a.stage_id,'fromStageId',NULL,'applicationRevision',a.revision,'chain',json('[]'),'source',r.source,'appliedPosition',r.applied_position),NEW.created_at
 FROM hiring_applications a JOIN resumes r ON r.id=a.resume_id AND r.owner_email=a.owner_email WHERE a.interview_id=NEW.process_id AND EXISTS(SELECT 1 FROM interview_rounds rr WHERE rr.id=json_extract(NEW.details_json,'$.roundId') AND rr.process_id=NEW.process_id AND rr.status='completed' AND NOT EXISTS(SELECT 1 FROM json_each(rr.interviewers_json) j WHERE NOT EXISTS(SELECT 1 FROM interview_feedback f WHERE f.round_id=rr.id AND f.interviewer=j.value AND f.status='submitted')));
END;

--> statement-breakpoint
CREATE TRIGGER hiring_initial_preparation_mode AFTER INSERT ON hiring_applications
WHEN json_extract(NEW.evidence_json,'$.preparationMode') IS NULL
BEGIN
 UPDATE hiring_applications SET evidence_json=json_set(evidence_json,'$.preparationMode',COALESCE((SELECT json_extract(v.definition_json,'$.preparationMode') FROM hiring_pipeline_versions v WHERE v.id=NEW.pipeline_version_id AND v.owner_email=NEW.owner_email),'legacy'),'$.preparationModeSource','pipeline') WHERE id=NEW.id AND owner_email=NEW.owner_email;
END;
