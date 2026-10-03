import "server-only";
import { getDatabaseBinding } from "@/db";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/resumes/resume-extraction";
import { uploadWorkflowStatements } from "@/features/workflows/workflow.server";
import { fail } from "@/features/workflows/workflow.server";
import { archiveStatements } from "@/features/archive/archive.server";
import { candidateProfileFromSummary } from "@/features/resumes/candidate-profile";
import { parseCandidateUpdate } from "@/features/resumes/resume.server";

export type CvUpdateRow = {
  resumeId: string;
  candidateId: string;
  ownerEmail: string;
  baseResumeId: string;
  status: string;
  draftJson: string;
  reason: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
};
export async function getCvUpdate(owner: string, resumeId: string) {
  return getDatabaseBinding()
    .prepare(
      "SELECT resume_id resumeId,candidate_id candidateId,owner_email ownerEmail,base_resume_id baseResumeId,status,draft_json draftJson,reason,reviewed_by reviewedBy,created_at createdAt,updated_at updatedAt FROM candidate_cv_updates WHERE owner_email=? AND resume_id=?",
    )
    .bind(owner, resumeId)
    .first<CvUpdateRow>();
}
export async function cvIsProtected(owner: string, resumeId: string) {
  const row = await getDatabaseBinding()
    .prepare(
      `SELECT (
    r.verification_status='verified'
    OR EXISTS(SELECT 1 FROM candidate_cv_reviews h WHERE h.resume_id=r.id)
    OR EXISTS(SELECT 1 FROM candidate_progress p WHERE p.selected_resume_id=r.id AND p.manual_stage='reviewing')
    OR EXISTS(SELECT 1 FROM workflow_runs w WHERE w.resume_id=r.id AND w.owner_email=r.owner_email)
    OR EXISTS(SELECT 1 FROM candidate_profile_versions v WHERE v.resume_id=r.id)
    OR EXISTS(SELECT 1 FROM candidates c WHERE c.id=r.candidate_id AND c.user_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=r.id)
  ) protected FROM resumes r WHERE r.id=? AND r.owner_email=?`,
    )
    .bind(resumeId, owner)
    .first<{ protected: number }>();
  return !row || !!row.protected;
}
function audit(
  owner: string,
  candidateId: string,
  action: string,
  metadata: Record<string, unknown>,
  now: string,
  actor = owner,
) {
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,'candidate',?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      owner,
      actor === owner ? "owner" : "candidate",
      actor,
      action,
      candidateId,
      JSON.stringify(metadata),
      now,
    );
}
export async function decideCvUpdate(
  owner: string,
  resumeId: string,
  body: Record<string, unknown>,
) {
  const row = await getCvUpdate(owner, resumeId);
  if (!row) fail("CV update not found.", 404);
  if (row.updatedAt !== body.updateRevision)
    fail("This CV update changed. Reload before reviewing it.", 409);
  if (!["pending", "reviewing"].includes(row.status))
    fail("This update already has a decision or has not been sent to HR.", 409);
  const db = getDatabaseBinding(),
    now = new Date().toISOString();
  const current = await db
    .prepare(
      "SELECT r.updated_at resumeRevision,c.updated_at candidateRevision FROM resumes r JOIN candidates c ON c.id=r.candidate_id WHERE r.id=? AND r.owner_email=? AND c.owner_email=?",
    )
    .bind(resumeId, owner, owner)
    .first<{ resumeRevision: string; candidateRevision: string }>();
  if (
    !current ||
    body.resumeRevision !== current.resumeRevision ||
    body.candidateRevision !== current.candidateRevision
  )
    fail("This CV changed. Reload before reviewing it.", 409);
  const action = String(body.action),
    draft = parseCandidateUpdate(body.candidate ?? JSON.parse(row.draftJson));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (
    ![
      "save_changes",
      "approve_cv",
      "decline_update",
      "start_update_review",
    ].includes(action)
  )
    fail("Choose a valid CV update action.", 422);
  if (!draft || (action === "approve_cv" && (!draft.fullName || !draft.email)))
    fail(
      "Enter the candidate’s full name and valid email before approval.",
      422,
    );
  if (action === "decline_update" && (reason.length < 3 || reason.length > 500))
    fail("Explain why you are keeping the current CV (3–500 characters).", 422);
  const status =
    action === "approve_cv"
      ? "accepted"
      : action === "decline_update"
        ? "declined"
        : "reviewing";
  const statements = [
    db
      .prepare(
        "INSERT INTO resume_edit_guards(resume_id,owner_email,resume_revision,candidate_revision) VALUES(?,?,?,?)",
      )
      .bind(resumeId, owner, current.resumeRevision, current.candidateRevision),
    db
      .prepare(
        "INSERT INTO candidate_cv_update_guards(resume_id,owner_email,revision,status) VALUES(?,?,?,?)",
      )
      .bind(resumeId, owner, row.updatedAt, row.status),
    db
      .prepare(
        "UPDATE candidate_cv_updates SET status=?,draft_json=?,reason=?,reviewed_by=?,updated_at=? WHERE resume_id=? AND owner_email=?",
      )
      .bind(
        status,
        JSON.stringify(draft),
        reason || null,
        owner,
        now,
        resumeId,
        owner,
      ),
    audit(
      owner,
      row.candidateId,
      `candidate.cv_update_${status}`,
      { resumeId, baseResumeId: row.baseResumeId, reason },
      now,
    ),
  ];
  if (action === "approve_cv") {
    const base = await db
      .prepare(
        "SELECT r.updated_at resumeRevision,r.verification_status verified,c.user_id userId FROM resumes r JOIN candidates c ON c.id=r.candidate_id WHERE r.id=? AND r.owner_email=?",
      )
      .bind(row.baseResumeId, owner)
      .first<{
        resumeRevision: string;
        verified: string;
        userId: string | null;
      }>();
    const progress = await db
      .prepare(
        "SELECT selected_resume_id selectedResumeId,version FROM candidate_progress WHERE candidate_id=? AND owner_email=?",
      )
      .bind(row.candidateId, owner)
      .first<{ selectedResumeId: string | null; version: number }>();
    const prepared = await db
      .prepare(
        "SELECT 1 prepared FROM workflow_runs w LEFT JOIN resumes r ON r.id=w.resume_id WHERE w.owner_email=? AND (w.resume_id=? OR r.candidate_id=? OR json_extract(w.context_json,'$.candidateId')=?) LIMIT 1",
      )
      .bind(owner, row.baseResumeId, row.candidateId, row.candidateId)
      .first();
    // If review has not produced an approved application yet, adopting the update finishes that initial review.
    if (
      base &&
      base.verified !== "verified" &&
      !base.userId &&
      !prepared &&
      (!progress || progress.selectedResumeId === row.baseResumeId)
    ) {
      statements.push(
        db
          .prepare(
            "INSERT INTO candidate_cv_initial_adoption_guards(owner_email,candidate_id,base_resume_id,progress_version) VALUES(?,?,?,?)",
          )
          .bind(
            owner,
            row.candidateId,
            row.baseResumeId,
            progress?.version ?? 0,
          ),
      );
      statements.push(
        db
          .prepare(
            "INSERT INTO resume_edit_guards(resume_id,owner_email,resume_revision,candidate_revision) VALUES(?,?,?,?)",
          )
          .bind(
            row.baseResumeId,
            owner,
            base.resumeRevision,
            current.candidateRevision,
          ),
      );
      statements.push(
        db
          .prepare(
            "UPDATE candidates SET full_name=?,first_name=?,last_name=?,email=?,normalized_email=?,phone=?,normalized_phone=?,address=?,date_of_birth=?,gender=?,nationality=?,current_title=?,professional_summary=?,skills_json=?,work_experience_json=?,education_json=?,certifications_json=?,languages_json=?,links_json=?,verification_status='verified',updated_at=? WHERE id=? AND owner_email=?",
          )
          .bind(
            draft.fullName,
            draft.fullName.split(/\s+/u)[0],
            draft.fullName.split(/\s+/u).slice(1).join(" "),
            draft.email,
            normalizeEmail(draft.email),
            draft.phone,
            normalizePhone(draft.phone),
            draft.address,
            draft.dateOfBirth,
            draft.gender,
            draft.nationality,
            draft.currentTitle,
            draft.professionalSummary,
            JSON.stringify(draft.skills),
            JSON.stringify(draft.workExperience),
            JSON.stringify(draft.education),
            JSON.stringify(draft.certifications),
            JSON.stringify(draft.languages),
            JSON.stringify(draft.links),
            now,
            row.candidateId,
            owner,
          ),
      );
      statements.push(
        db
          .prepare(
            "UPDATE candidate_progress SET selected_resume_id=?,primary_run_id=NULL,manual_stage=NULL,basis_json=NULL,version=version+1,updated_at=? WHERE candidate_id=? AND owner_email=?",
          )
          .bind(resumeId, now, row.candidateId, owner),
      );
    }
    const latest = await db
      .prepare(
        "SELECT COALESCE(MAX(version_number),0) version FROM candidate_profile_versions WHERE candidate_id=? AND owner_email=?",
      )
      .bind(row.candidateId, owner)
      .first<{ version: number }>();
    // Approve an independent snapshot; never mutate the active application profile or restart workflows.
    statements.push(
      db
        .prepare(
          "INSERT INTO candidate_profile_versions(id,owner_email,candidate_id,resume_id,version_number,schema_version,profile_json,verification_status,source,created_by_email,created_at,verified_at) VALUES(?,?,?,?,?,2,?,'verified','cv_update',?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          owner,
          row.candidateId,
          resumeId,
          (latest?.version ?? 0) + 1,
          JSON.stringify(
            candidateProfileFromSummary({
              ...draft,
              id: row.candidateId,
              verificationStatus: "verified",
            }),
          ),
          owner,
          now,
          now,
        ),
      db
        .prepare(
          "UPDATE resumes SET verification_status='verified',status='ready',updated_at=? WHERE id=? AND owner_email=?",
        )
        .bind(now, resumeId, owner),
    );
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /CV_UPDATE_CHANGED|RESUME_EDIT_CHANGED|UNIQUE/.test(error.message)
    )
      fail("This candidate or CV update changed. Reload before deciding.", 409);
    throw error;
  }
  return { saved: true, approved: action === "approve_cv", update: true };
}

export async function confirmBotCvUpdate(
  owner: string,
  resumeId: string,
  cancel = false,
) {
  const row = await getCvUpdate(owner, resumeId);
  if (!row || row.status !== "awaiting_confirmation")
    fail("There is no CV upload waiting for confirmation.", 409);
  const db = getDatabaseBinding(),
    now = new Date().toISOString();
  const protectedCv = await cvIsProtected(owner, row.baseResumeId);
  const base = await db
    .prepare(
      "SELECT r.updated_at revision,i.id intakeId,r.candidate_id candidateId,c.updated_at candidateRevision,COALESCE(p.version,0) progressVersion FROM resumes r JOIN candidates c ON c.id=r.candidate_id LEFT JOIN telegram_intakes i ON i.resume_id=r.id LEFT JOIN candidate_progress p ON p.candidate_id=c.id WHERE r.id=? AND r.owner_email=?",
    )
    .bind(row.baseResumeId, owner)
    .first<{
      revision: string;
      intakeId: string | null;
      candidateId: string;
      candidateRevision: string;
      progressVersion: number;
    }>();
  const status = cancel
    ? "cancelled"
    : protectedCv || !base?.intakeId
      ? "pending"
      : "replaced";
  const statements = [
    db
      .prepare(
        "INSERT INTO candidate_cv_update_guards(resume_id,owner_email,revision,status) VALUES(?,?,?,?)",
      )
      .bind(resumeId, owner, row.updatedAt, row.status),
  ];
  if (status === "replaced" && base) {
    // Recheck the base CV in the same transaction as archiving; review may have started during upload.
    statements.push(
      db
        .prepare(
          "INSERT INTO telegram_replacement_guards(resume_id,owner_email,resume_revision) VALUES(?,?,?)",
        )
        .bind(row.baseResumeId, owner, base.revision),
    );
    statements.push(
      ...(await archiveStatements(owner, "intake", base.intakeId!, now)),
    );
    const events = await uploadWorkflowStatements(
      owner,
      resumeId,
      now,
      "telegram_submission",
    );
    statements.push(
      ...events.map((q) => {
        const p = q.toSQL();
        return db.prepare(p.sql).bind(...p.params);
      }),
    );
    statements.push(
      db
        .prepare(
          "UPDATE candidate_progress SET selected_resume_id=?,primary_run_id=NULL,manual_stage=NULL,basis_json=NULL,version=version+1,updated_at=? WHERE candidate_id=? AND selected_resume_id=? AND owner_email=?",
        )
        .bind(resumeId, now, row.candidateId, row.baseResumeId, owner),
    );
  }
  if (cancel)
    statements.push(
      ...(await archiveStatements(owner, "resume", resumeId, now)),
    );
  statements.push(
    db
      .prepare(
        "UPDATE candidate_cv_updates SET status=?,updated_at=? WHERE resume_id=? AND owner_email=?",
      )
      .bind(status, now, resumeId, owner),
    audit(
      owner,
      row.candidateId,
      `candidate.cv_update_${status}`,
      { resumeId, baseResumeId: row.baseResumeId },
      now,
      "Candidate via Telegram",
    ),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (
      !protectedCv &&
      !cancel &&
      error instanceof Error &&
      /CV_REPLACEMENT_CHANGED/.test(error.message)
    )
      return confirmBotCvUpdate(owner, resumeId, false);
    throw error;
  }
  return status;
}
