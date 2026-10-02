import {
  verifiedResume,
  existingVerifiedAccount,
} from "@/features/workflows/verified-resume.server";
import { isArchived } from "@/features/archive/archive.server";
import { getDatabaseBinding } from "@/db";
import { getIntake } from "@/features/telegram/intake.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
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
        "SELECT i.id,r.file_name fileName,r.verification_status verificationStatus,i.created_at createdAt,EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='intake' AND ar.entity_id=i.id) archived FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id WHERE i.connection_id=? AND i.owner_email=? ORDER BY i.created_at DESC",
      )
      .bind(row.connection.id, owner)
      .all();
    const runs = await binding
      .prepare(
        "SELECT id,workflow_id workflowId,status,error_message errorMessage FROM workflow_runs WHERE resume_id=? AND owner_email=? AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='workflow_run' AND ar.entity_id=workflow_runs.id) ORDER BY created_at DESC",
      )
      .bind(row.resume.id, owner)
      .all();
    return {
      archived:
        (await isArchived("intake", row.intake.id)) ||
        (await isArchived("resume", row.resume.id)),
      reviewReady: !!verified,
      reviewedAt: verified?.profile.verifiedAt ?? null,
      resumeRevision: row.resume.updatedAt,
      candidateRevision: row.candidate.updatedAt,
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
