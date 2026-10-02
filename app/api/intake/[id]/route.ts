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
    return {
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
