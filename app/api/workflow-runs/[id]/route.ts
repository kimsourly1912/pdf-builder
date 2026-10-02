import { isArchived } from "@/features/archive/archive.server";
import { notArchived } from "@/features/archive/archive";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { workflowRuns } from "@/features/workflows/schema";
import {
  fail,
  getRun,
  workflowAudit,
} from "@/features/workflows/workflow.server";
import { processWorkflowRun } from "@/features/workflows/runner.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return workflowResponse(async () => ({
    run: await getRun(
      await requireRequestOwner(request),
      (await context.params).id,
    ),
  }));
}
export async function PATCH(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    const { id } = await context.params;
    const body = await workflowBody(request);
    const run = await getRun(owner, id);
    if (
      (await isArchived("workflow_run", id)) ||
      (await isArchived("resume", run.resumeId))
    )
      fail("Restore this run and CV from Archive before retrying.", 409);
    if (run.status !== "failed" || body.expectedUpdatedAt !== run.updatedAt)
      fail("This run changed. Refresh before retrying.", 409);
    if (body.action !== "retry" && body.action !== "return_review")
      fail("Choose a valid run action.");
    const node = run.graph.nodes.find((n) => n.id === run.currentNodeId);
    const review = run.graph.nodes.find((n) => n.kind === "review_resume");
    const returning = body.action === "return_review";
    if (
      returning &&
      (node?.kind !== "create_account" ||
        !review ||
        run.context.steps[node.id]?.status === "completed")
    )
      fail("Only an account creation failure can return to review.", 409);
    const [changed] = await getDb()
      .update(workflowRuns)
      .set({
        status: returning ? "waiting_review" : "queued",
        currentNodeId: returning ? review!.id : run.currentNodeId,
        errorMessage: null,
        lockToken: null,
        lockedUntil: null,
        ...(returning ? { passwordHash: null } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(workflowRuns.id, id),
          eq(workflowRuns.ownerEmail, owner),
          eq(workflowRuns.status, "failed"),
          eq(workflowRuns.updatedAt, run.updatedAt),
          notArchived("workflow_run", workflowRuns.id),
          notArchived("resume", workflowRuns.resumeId),
        ),
      )
      .returning({ id: workflowRuns.id });
    if (!changed) fail("This run was already resumed.", 409);
    await workflowAudit(
      owner,
      returning ? "workflow.returned_to_review" : "workflow.retried",
      id,
    );
    if (!returning) await processWorkflowRun(id);
    return { run: await getRun(owner, id) };
  });
}
