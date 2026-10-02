import { progressOverview } from "@/features/candidate-progress/progress.server";
import { submissionProgress } from "@/features/candidate-progress/submission-progress";
import {
  verifiedResume,
  existingVerifiedAccount,
} from "@/features/workflows/verified-resume.server";
import { isArchived } from "@/features/archive/archive.server";
import { getDatabaseBinding } from "@/db";
import { getIntake } from "@/features/telegram/intake.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { fail } from "@/features/workflows/workflow.server";
import { candidateSummary } from "@/features/resumes/resume.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    const row = await getIntake(owner, (await context.params).id);
    if (!row) fail("Candidate intake not found.", 404);
    const verified = await verifiedResume(owner, row.resume.id),
      binding = getDatabaseBinding();
    const history = await binding
      .prepare(
        "SELECT i.id,r.file_name fileName,r.verification_status verificationStatus,i.created_at createdAt,EXISTS(SELECT 1 FROM candidate_profile_versions p WHERE p.resume_id=r.id AND p.verification_status='verified') previouslyApproved,EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='intake' AND ar.entity_id=i.id) archived FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id WHERE i.connection_id=? AND i.owner_email=? ORDER BY i.created_at DESC,i.update_id DESC",
      )
      .bind(row.connection.id, owner)
      .all();
    const runs = await binding
      .prepare(
        "SELECT id,workflow_id workflowId,status,error_message errorMessage,EXISTS(SELECT 1 FROM json_each(graph_json,'$.nodes') n WHERE json_extract(n.value,'$.kind')='assign_forms') hasPreparation FROM workflow_runs WHERE resume_id=? AND owner_email=? AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='workflow_run' AND ar.entity_id=workflow_runs.id) ORDER BY created_at DESC",
      )
      .bind(row.resume.id, owner)
      .all();
    const progress = (await progressOverview(owner, row.resume.id)).find(
      (p) => p.id === row.candidate.id,
    );
    return {
      progress: progress
        ? {
            ...submissionProgress(progress),
            fileName: progress.selectedCv.fileName,
          }
        : null,
      archived:
        (await isArchived("intake", row.intake.id)) ||
        (await isArchived("resume", row.resume.id)),
      reviewReady: !!verified,
      reviewedAt: verified?.profile.verifiedAt ?? null,
      resumeRevision: row.resume.updatedAt,
      candidateRevision: row.candidate.updatedAt,
      contactRevision: row.connection.updatedAt,
      profileVersionId: verified?.profile.id ?? null,
      existingAccount: verified
        ? await existingVerifiedAccount(
            owner,
            verified.candidate.normalizedEmail,
          )
        : null,
      cvHistory: history.results ?? [],
      runs: runs.results ?? [],
      id: row.intake.id,
      resumeId: row.resume.id,
      fileName: row.resume.fileName,
      extractionStatus:
        row.intake.extractionStatus === "processing" &&
        row.intake.extractionUntil &&
        row.intake.extractionUntil < new Date().toISOString()
          ? "failed"
          : row.intake.extractionStatus,
      candidate: candidateSummary(row.candidate),
      contact: {
        fullName: row.connection.fullName,
        email: row.connection.email,
        username: row.connection.username,
      },
      accountCreated: !!row.candidate.userId,
      possibleDuplicate: !!row.resume.duplicateCandidateId,
      confirmed: row.connection.confirmedCandidateId === row.candidate.id,
    };
  });
}

export async function PATCH(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      row = await getIntake(owner, (await context.params).id);
    if (!row) fail("Candidate intake not found.", 404);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      fail("Use the same site to confirm this contact.", 403);
    const body = await workflowBody(request);
    if (body.action !== "confirm_contact" || body.confirm !== true)
      fail("Confirm this contact belongs to the candidate.", 422);
    if (
      body.resumeRevision !== row.resume.updatedAt ||
      body.candidateRevision !== row.candidate.updatedAt ||
      body.contactRevision !== row.connection.updatedAt
    )
      fail("This candidate changed. Refresh before confirming.", 409);
    if (
      (await isArchived("intake", row.intake.id)) ||
      (await isArchived("resume", row.resume.id))
    )
      fail("Restore this intake before confirming its contact.", 409);
    const db = getDatabaseBinding(),
      now = new Date().toISOString();
    const results = await db.batch([
      db
        .prepare(
          "INSERT INTO resume_edit_guards(resume_id,owner_email,resume_revision,candidate_revision) VALUES(?,?,?,?)",
        )
        .bind(
          row.resume.id,
          owner,
          row.resume.updatedAt,
          row.candidate.updatedAt,
        ),
      db
        .prepare(
          "UPDATE telegram_connections SET confirmed_candidate_id=?,confirmed_by=?,confirmed_at=?,updated_at=? WHERE id=? AND owner_email=? AND updated_at=?",
        )
        .bind(
          row.candidate.id,
          owner,
          now,
          now,
          row.connection.id,
          owner,
          row.connection.updatedAt,
        ),
      db
        .prepare(
          "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) SELECT ?,?,'owner',?,'telegram.contact_confirmed','candidate',?,?,? WHERE changes()=1",
        )
        .bind(
          crypto.randomUUID(),
          owner,
          owner,
          row.candidate.id,
          JSON.stringify({ intakeId: row.intake.id }),
          now,
        ),
    ]);
    if (results[1]?.meta?.changes !== 1)
      fail("This contact changed. Refresh before confirming.", 409);
    return { confirmed: true };
  });
}
