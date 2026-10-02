import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import {
  fail,
  getRun,
  getWorkflow,
  startWorkflow,
} from "@/features/workflows/workflow.server";
import { workflowRuns } from "@/features/workflows/schema";
import { processWorkflowRun } from "@/features/workflows/runner.server";
import {
  verifiedResume,
  existingVerifiedAccount,
} from "@/features/workflows/verified-resume.server";
import { getIntake } from "@/features/telegram/intake.server";
import { isArchived } from "@/features/archive/archive.server";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      id = (await context.params).id,
      body = await workflowBody(request),
      intake = await getIntake(owner, id);
    if (!intake) fail("Candidate intake not found.", 404);
    if (
      (await isArchived("intake", id)) ||
      (await isArchived("resume", intake.resume.id))
    )
      fail("Restore this CV from Archive before running a workflow.", 409);
    const verified = await verifiedResume(owner, intake.resume.id);
    if (!verified)
      fail(
        "Review and save this CV as verified in the Resume Editor first. AI extraction is optional.",
        422,
      );
    if (
      body.resumeRevision !== verified.proof.resumeRevision ||
      body.candidateRevision !== verified.proof.candidateRevision ||
      body.profileVersionId !== verified.proof.profileVersionId
    )
      fail("The CV review changed. Refresh this overview before running.", 409);
    if (body.confirmTelegram !== true)
      fail("Confirm the Telegram contact before sending account access.", 422);
    const existing = await existingVerifiedAccount(
      owner,
      verified.candidate.normalizedEmail,
    );
    if (existing && body.existingAccountId !== existing.id)
      fail("Explicitly confirm the existing account before reusing it.", 422);
    const workflow = await getWorkflow(owner, String(body.workflowId ?? ""));
    if (!workflow.version) fail("Publish the workflow first.", 422);
    // The approval is consumed by the published snapshot, so it cannot bypass graph ordering.
    const initial = {
      steps: {},
      resumeEditorApproval: {
        ...verified.proof,
        existingAccountId: existing?.id,
      },
      telegramConnectionId: intake.connection.id,
      telegramChatId: intake.connection.chatId,
    };
    const runId = await startWorkflow(
        owner,
        workflow.id,
        intake.resume.id,
        initial,
      ),
      run = await getRun(owner, runId);
    if (!run.graph.nodes.some((n) => n.kind === "send_telegram"))
      fail("Choose a workflow with a Telegram invitation step.", 422);
    if (
      !run.context.reviewedAt &&
      ["queued", "waiting_review", "failed"].includes(run.status)
    ) {
      const now = new Date().toISOString();
      await getDb()
        .update(workflowRuns)
        .set({
          contextJson: JSON.stringify({
            ...run.context,
            ...initial,
            steps: run.context.steps,
          }),
          status: "queued",
          errorMessage: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(workflowRuns.id, runId),
            eq(workflowRuns.ownerEmail, owner),
            eq(workflowRuns.updatedAt, run.updatedAt),
            isNull(workflowRuns.lockToken),
          ),
        );
    }
    await processWorkflowRun(runId);
    return { run: await getRun(owner, runId) };
  });
}
