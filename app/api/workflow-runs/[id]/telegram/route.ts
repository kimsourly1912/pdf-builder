import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { candidates } from "@/db/schema";
import {
  telegramConnections,
  telegramDeliveries,
} from "@/features/telegram/schema";
import {
  workflowExecutionGuards,
  workflowRuns,
} from "@/features/workflows/schema";
import {
  fail,
  getRun,
  workflowAudit,
} from "@/features/workflows/workflow.server";
import { processWorkflowRun } from "@/features/workflows/runner.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { requireRequestOwner } from "@/features/templates/template.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, params: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      id = (await params.params).id,
      run = await getRun(owner, id);
    const node = run.graph.nodes.find((n) => n.kind === "send_telegram");
    const [delivery] = node
      ? await getDb()
          .select({
            status: telegramDeliveries.status,
            errorMessage: telegramDeliveries.errorMessage,
            nextAttemptAt: telegramDeliveries.nextAttemptAt,
            updatedAt: telegramDeliveries.updatedAt,
          })
          .from(telegramDeliveries)
          .where(
            and(
              eq(telegramDeliveries.runId, id),
              eq(telegramDeliveries.nodeId, node.id),
            ),
          )
          .limit(1)
      : [];
    return { delivery: delivery ?? null };
  });
}
export async function POST(request: Request, params: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      { id } = await params.params,
      body = await workflowBody(request),
      run = await getRun(owner, id),
      db = getDb();
    const node = run.graph.nodes.find((n) => n.kind === "send_telegram");
    if (
      !node ||
      !run.context.userId ||
      !run.context.candidateId ||
      body.expectedUpdatedAt !== run.updatedAt ||
      body.confirm !== true
    )
      fail("Confirm the Telegram action and refresh current run details.", 409);
    const resending = body.action === "resend";
    if (body.action !== "connect" && !resending)
      fail("Choose connect or resend.");
    if (
      run.currentNodeId !== node.id &&
      !(
        resending &&
        run.status === "completed" &&
        run.context.steps[node.id]?.status === "completed"
      )
    )
      fail(
        "Finish review and form assignment before sending an invitation.",
        409,
      );
    if (!["queued", "failed", "completed"].includes(run.status))
      fail("This run is already processing.", 409);
    const [candidate] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.id, run.context.candidateId),
          eq(candidates.ownerEmail, owner),
          eq(candidates.userId, run.context.userId),
        ),
      )
      .limit(1);
    if (!candidate)
      fail(
        "The approved account link changed. Review the candidate in Accounts.",
        409,
      );
    const connectionId =
      typeof body.connectionId === "string" && body.connectionId
        ? body.connectionId
        : run.context.telegramConnectionId;
    const [connection] = connectionId
      ? await db
          .select()
          .from(telegramConnections)
          .where(
            and(
              eq(telegramConnections.id, connectionId),
              eq(telegramConnections.ownerEmail, owner),
            ),
          )
          .limit(1)
      : [];
    if (!connection) fail("Choose a candidate Telegram connection.", 422);
    if (
      body.contactRevision !== undefined &&
      body.contactRevision !== connection.updatedAt
    )
      fail(
        "Telegram contact changed. Refresh and confirm the current recipient.",
        409,
      );
    const [delivery] = await db
      .select()
      .from(telegramDeliveries)
      .where(
        and(
          eq(telegramDeliveries.runId, id),
          eq(telegramDeliveries.nodeId, node.id),
        ),
      )
      .limit(1);
    if (delivery && delivery.chatId !== connection.chatId)
      fail(
        "An invitation already targets another contact. Resolve that contact before resending.",
        409,
      );
    if (
      !resending &&
      delivery &&
      ["sent", "sending", "uncertain"].includes(delivery.status)
    )
      fail(
        "Confirm a resend explicitly. Telegram may already have accepted the previous message.",
        409,
      );
    const now = new Date().toISOString(),
      token = crypto.randomUUID();
    const [claimed] = await db
      .update(workflowRuns)
      .set({
        status: "running",
        lockToken: token,
        lockedUntil: new Date(Date.now() + 600000).toISOString(),
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowRuns.id, id),
          eq(workflowRuns.ownerEmail, owner),
          eq(workflowRuns.updatedAt, run.updatedAt),
          or(
            isNull(workflowRuns.lockedUntil),
            lt(workflowRuns.lockedUntil, now),
          ),
        ),
      )
      .returning();
    if (!claimed) fail("The run changed. Refresh before continuing.", 409);
    const context = {
      ...run.context,
      telegramConnectionId: connection.id,
      telegramChatId: connection.chatId,
    };
    delete context.waitingFor;
    try {
      await db.batch([
        db
          .insert(workflowExecutionGuards)
          .values({
            runId: id,
            lockToken: sql<string>`CASE WHEN EXISTS(SELECT 1 FROM telegram_connections WHERE id=${connection.id} AND owner_email=${owner} AND updated_at=${connection.updatedAt} AND chat_id=${connection.chatId}) THEN ${token} ELSE '' END`,
            checkedAt: now,
          }),
        db
          .update(telegramConnections)
          .set({
            candidateId: candidate.id,
            confirmedCandidateId: candidate.id,
            confirmedBy: owner,
            confirmedAt: now,
            updatedAt: now,
          })
          .where(eq(telegramConnections.id, connection.id)),
        ...(delivery
          ? [
              db
                .update(telegramDeliveries)
                .set({
                  status: "pending",
                  errorMessage: null,
                  nextAttemptAt: null,
                  updatedAt: now,
                })
                .where(eq(telegramDeliveries.id, delivery.id)),
            ]
          : []),
        db
          .update(workflowRuns)
          .set({
            status: "queued",
            currentNodeId: node.id,
            contextJson: JSON.stringify(context),
            errorMessage: null,
            lockToken: null,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(
            and(eq(workflowRuns.id, id), eq(workflowRuns.lockToken, token)),
          ),
        workflowAudit(
          owner,
          resending
            ? "workflow.telegram_resend_requested"
            : "workflow.telegram_confirmed",
          id,
          { connectionId: connection.id },
        ),
      ]);
    } catch (error) {
      await db
        .update(workflowRuns)
        .set({ status: run.status, lockToken: null, lockedUntil: null })
        .where(and(eq(workflowRuns.id, id), eq(workflowRuns.lockToken, token)));
      if (
        error instanceof Error &&
        /WORKFLOW_LEASE_CHANGED/.test(error.message)
      )
        fail(
          "The run or Telegram contact changed. Refresh before continuing.",
          409,
        );
      throw error;
    }
    await processWorkflowRun(id);
    return { run: await getRun(owner, id) };
  });
}
