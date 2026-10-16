import "server-only";
// Compare all inputs used by the candidate's preparation projection in the handoff
// batch, including assignment membership, review revisions and current approval.
// Scope to this candidate and linked accounts instead of unrelated owner history.
const owner = "(SELECT owner FROM interview_scope)",
  candidate = "(SELECT candidate FROM interview_scope)";
const sources = [
  ["interview_processes", `owner_email=${owner} AND candidate_id=${candidate}`, "id,version,rounds_complete,outcome,hold_json"],
  ["interview_rounds", `process_id IN (SELECT id FROM interview_processes WHERE owner_email=${owner} AND candidate_id=${candidate})`, "id,status,stage_id,interviewers_json,updated_at"],
  ["interview_feedback", `round_id IN (SELECT r.id FROM interview_rounds r JOIN interview_processes p ON p.id=r.process_id WHERE p.owner_email=${owner} AND p.candidate_id=${candidate})`, "id,round_id,interviewer,status,updated_at"],
  [
    "candidates",
    `owner_email=${owner} AND id=${candidate}`,
    "id,updated_at,verification_status,user_id,full_name,email",
  ],
  [
    "resumes",
    "id IN (SELECT id FROM scoped_resumes)",
    "id,updated_at,verification_status,duplicate_candidate_id",
  ],
  [
    "candidate_profile_versions",
    `owner_email=${owner} AND candidate_id=${candidate}`,
    "id,created_at,verified_at,verification_status,created_by_email,resume_id",
  ],
  [
    "candidate_progress",
    `owner_email=${owner} AND candidate_id=${candidate}`,
    "selected_resume_id,primary_run_id,version",
  ],
  [
    "workflow_runs",
    "id IN (SELECT id FROM scoped_runs)",
    "id,resume_id,status,updated_at,context_json,graph_json",
  ],
  [
    "form_assignments",
    "id IN (SELECT id FROM scoped_forms)",
    "id,user_id,template_id,template_version_id,role_id,status,completed_at,updated_at,candidate_profile_version_id,recipient_link_id",
  ],
  [
    "recipient_links",
    "id IN (SELECT recipient_link_id FROM scoped_forms)",
    "id,assigned_user_id,template_id,template_version_id,status,submission_count,completed_at,expires_at",
  ],
  [
    "submissions",
    "id IN (SELECT id FROM scoped_submissions)",
    "id,template_id,template_version_id,recipient_link_id,submitted_at",
  ],
  [
    "submission_reviews",
    `owner_email=${owner} AND submission_id IN (SELECT id FROM scoped_submissions)`,
    "submission_id,status,revision,reviewed_at,reviewed_by,correction_link_id",
  ],
  [
    "telegram_deliveries",
    `owner_email=${owner} AND run_id IN (SELECT id FROM scoped_runs)`,
    "id,run_id,status,updated_at",
  ],
  [
    "archive_records",
    `owner_email=${owner} AND ((entity_type='resume' AND entity_id IN (SELECT id FROM scoped_resumes)) OR (entity_type='intake' AND entity_id IN (SELECT id FROM scoped_intakes)) OR (entity_type='workflow_run' AND entity_id IN (SELECT id FROM scoped_runs)) OR (entity_type='submission' AND entity_id IN (SELECT id FROM scoped_submissions)) OR (entity_type='account' AND entity_id IN (SELECT user_id FROM scoped_accounts)))`,
    "entity_type,entity_id,archived_at",
  ],
  [
    "candidate_cv_updates",
    `owner_email=${owner} AND candidate_id=${candidate}`,
    "resume_id,status,updated_at",
  ],
  [
    "recipient_profiles",
    `created_by_email=${owner} AND user_id IN (SELECT user_id FROM scoped_accounts)`,
    "user_id,created_by_email",
  ],
  ["user", "id IN (SELECT user_id FROM scoped_accounts)", "id,email,banned"],
  [
    "templates",
    `owner_email=${owner} AND id IN (SELECT template_id FROM scoped_forms)`,
    "id,owner_email,kind,name",
  ],
  [
    "telegram_intakes",
    "id IN (SELECT id FROM scoped_intakes)",
    "id,resume_id,connection_id",
  ],
  [
    "telegram_connections",
    `owner_email=${owner} AND id IN (SELECT connection_id FROM scoped_intakes)`,
    "id,username,confirmed_candidate_id,confirmed_by",
  ],
] as const;
export const preparationProofSql = `WITH interview_scope AS (SELECT ? owner, ? candidate),
 scoped_resumes AS (SELECT id FROM resumes WHERE owner_email=${owner} AND candidate_id=${candidate}),
 scoped_runs AS (SELECT id,context_json FROM workflow_runs WHERE owner_email=${owner} AND (resume_id IN (SELECT id FROM scoped_resumes) OR json_extract(context_json,'$.candidateId')=${candidate})),
 scoped_accounts AS (SELECT user_id FROM candidates WHERE owner_email=${owner} AND id=${candidate} UNION SELECT json_extract(context_json,'$.userId') FROM scoped_runs),
 scoped_forms AS (SELECT f.id,f.recipient_link_id,f.template_id FROM form_assignments f JOIN recipient_profiles p ON p.user_id=f.user_id WHERE p.created_by_email=${owner} AND f.user_id IN (SELECT user_id FROM scoped_accounts)),
 scoped_submissions AS (SELECT id FROM submissions WHERE recipient_link_id IN (SELECT recipient_link_id FROM scoped_forms)),
 scoped_intakes AS (SELECT id,connection_id FROM telegram_intakes WHERE owner_email=${owner} AND resume_id IN (SELECT id FROM scoped_resumes))
 SELECT json_array(${sources.map(([table, where, columns]) => `(SELECT COALESCE(json_group_array(json(row)),'[]') FROM (SELECT json_array(${columns}) row FROM ${table} WHERE ${where} ORDER BY rowid))`).join(",")}) proof`;
