import "server-only";
import { getDatabaseBinding } from "@/db";
import {
  hashRecipientToken,
  isResponse,
} from "@/features/templates/template.server";
import type { workflowRuns } from "@/features/workflows/schema";
import type { RunContext, WorkflowNode } from "@/features/workflows/workflow";
import { WorkflowStepError } from "@/features/workflows/workflow-errors";
import { verifiedResume } from "@/features/workflows/verified-resume.server";
import {
  applicationProof,
  getApplication,
  mutateApplication,
  hiringConfiguration,
} from "./hiring.server";
import { resolvePipelineReference } from "./pipeline-references";

// CV workflows retain their once-per-CV identity. Do not change application_id:
// that column owns independent application preparation and its uniqueness rules.
export async function moveResumeApplication(
  row: typeof workflowRuns.$inferSelect,
  token: string,
  node: WorkflowNode,
  context: RunContext,
  checkpoint: () => Promise<void>,
) {
  if (
    !node.config.pipelineVersionId ||
    !node.config.fromStageId ||
    !node.config.stageId
  )
    throw new WorkflowStepError(
      "Choose a published pipeline, expected current stage and destination in Move application.",
    );
  if (!context.candidateId || !context.profileVersionId || context.rejection)
    throw new WorkflowStepError("Approve this CV before moving its application.");
  const db = getDatabaseBinding();
  const pipelineId = resolvePipelineReference(await hiringConfiguration(row.ownerEmail), node.config.pipelineVersionId);
  context.applicationMoves ??= {};
  let target = context.applicationMoves[node.id];
  if (!target) {
    const matches = (
      await db
        .prepare(
          "SELECT a.id,a.revision FROM hiring_applications a JOIN resumes r ON r.id=a.resume_id AND r.candidate_id=a.candidate_id AND r.owner_email=a.owner_email WHERE a.owner_email=? AND a.resume_id=? AND a.candidate_id=? AND a.pipeline_version_id=? AND a.outcome IS NULL AND (? IS NULL OR a.id=?) AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='hiring_application' AND x.entity_id=a.id) ORDER BY a.id LIMIT 2",
        )
        .bind(
          row.ownerEmail,
          row.resumeId,
          context.candidateId,
          pipelineId,
          row.applicationId,
          row.applicationId,
        )
        .all<{ id: string; revision: number }>()
    ).results;
    if (!matches.length)
      throw new WorkflowStepError(
        "No active application uses this CV in the selected pipeline. Add it in Hiring, or use that pipeline as the default inbox for future Telegram CVs.",
      );
    if (matches.length > 1)
      throw new WorkflowStepError(
        "More than one active application uses this CV in the selected pipeline. Use an application starting event to route each application separately.",
      );
    target = { applicationId: matches[0].id, revision: matches[0].revision };
    context.applicationMoves[node.id] = target;
    // Persist identity and revision before any effect, so a lost acknowledgement
    // cannot select another application or change the receipt's request hash.
    await checkpoint();
  }
  const mutationId = `cv_move_${await hashRecipientToken(`${row.id}:${node.id}`)}`;
  try {
    const receipt = await db
      .prepare(
        "SELECT application_id FROM hiring_receipts WHERE id=? AND owner_email=?",
      )
      .bind(mutationId, row.ownerEmail)
      .first();
    let proof: string | undefined;
    if (!receipt) {
      const app = await getApplication(row.ownerEmail, target.applicationId);
      if (
        app.resumeId !== row.resumeId ||
        app.candidateId !== context.candidateId ||
        app.pipelineVersionId !== pipelineId
      )
        throw new WorkflowStepError(
          "This application's CV or pipeline changed. Review the application before continuing.",
        );
      proof = await applicationProof(row.ownerEmail, app);
      const approved = await verifiedResume(row.ownerEmail, row.resumeId);
      if (!approved || approved.profile.id !== context.profileVersionId)
        throw new WorkflowStepError(
          "The approved CV changed. Review and approve it again before moving the application.",
        );
    }
    await mutateApplication(
      row.ownerEmail,
      target.applicationId,
      {
        action: "move",
        stageId: node.config.stageId,
        fromStageId: node.config.fromStageId,
        expectedRevision: target.revision,
        mutationId,
        reason: "Published CV workflow after HR approval",
      },
      {
        runId: row.id,
        token,
        chain: context.applicationChain ?? [],
        workflowId: row.workflowId,
        expectedProof: proof,
      },
    );
  } catch (error) {
    if (isResponse(error)) {
      const body: unknown = await error.json();
      if (
        body && typeof body === "object" &&
        "error" in body && typeof body.error === "string"
      )
        throw new WorkflowStepError(body.error);
    }
    throw error;
  }
}
