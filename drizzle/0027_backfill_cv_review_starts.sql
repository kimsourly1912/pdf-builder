-- Preserve review work recorded through the Kanban before explicit review starts existed.
INSERT INTO candidate_cv_reviews(resume_id,owner_email,started_by,started_at)
SELECT r.id,p.owner_email,p.owner_email,
 COALESCE((SELECT MIN(a.created_at) FROM audit_events a WHERE a.owner_email=p.owner_email AND a.target_type='candidate' AND a.target_id=p.candidate_id AND a.action='candidate.progress_stage_changed' AND json_extract(a.metadata_json,'$.resumeId')=r.id AND json_extract(a.metadata_json,'$.to')='Reviewing CV'),p.updated_at)
FROM candidate_progress p JOIN resumes r ON r.id=p.selected_resume_id AND r.candidate_id=p.candidate_id AND r.owner_email=p.owner_email
WHERE p.manual_stage='reviewing' AND r.verification_status<>'verified'
 AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id)
ON CONFLICT(resume_id) DO NOTHING;
