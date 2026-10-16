import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  candidates,
  formAssignments,
  recipientProfiles,
  user,
} from "@/db/schema";
import {
  workflowExecutionGuards,
  workflowRuns,
} from "@/features/workflows/schema";
import type { RunContext, StepConfig } from "@/features/workflows/workflow";
import {
  accountActivations,
  telegramConnections,
  telegramDeliveries,
} from "./schema";
import {
  activationToken,
  decryptActivation,
  encryptActivation,
  tokenHash,
} from "./activation";
import {
  botConfiguration,
  sendBotMessage,
  telegramRuntime,
  TelegramSendError,
} from "./bot.server";
import { DEFAULT_TELEGRAM_MESSAGE, invitationText } from "./telegram";

export async function deliverWorkflowInvitation(
  run: typeof workflowRuns.$inferSelect,
  leaseToken: string,
  context: RunContext,
  nodeId: string,
  config: StepConfig,
): Promise<"sent" | "waiting"> {
  const db = getDb(),
    now = new Date().toISOString();
  if (!context.userId || !context.candidateId)
    throw new Error("Approved account is unavailable.");
  if (!context.telegramConnectionId) {
    context.waitingFor = "telegram";
    return "waiting";
  }
  const [connection] = await db
    .select()
    .from(telegramConnections)
    .where(
      and(
        eq(telegramConnections.ownerEmail, run.ownerEmail),
        eq(telegramConnections.confirmedCandidateId, context.candidateId),
        eq(telegramConnections.confirmedBy, run.ownerEmail),
        context.telegramConnectionId
          ? eq(telegramConnections.id, context.telegramConnectionId)
          : undefined,
        context.telegramChatId
          ? eq(telegramConnections.chatId, context.telegramChatId)
          : undefined,
      ),
    )
    .limit(1);
  if (!connection || !botConfiguration().configured) {
    context.waitingFor = "telegram";
    return "waiting";
  }
  const [recipient] = await db
    .select({ profile: recipientProfiles, account: user })
    .from(recipientProfiles)
    .innerJoin(user, eq(user.id, recipientProfiles.userId))
    .innerJoin(
      candidates,
      and(
        eq(candidates.userId, user.id),
        eq(candidates.id, context.candidateId),
        eq(candidates.ownerEmail, run.ownerEmail),
      ),
    )
    .where(
      and(
        eq(recipientProfiles.userId, context.userId),
        eq(recipientProfiles.createdByEmail, run.ownerEmail),
        eq(recipientProfiles.accountType, "candidate"),
        eq(user.banned, false),
      ),
    )
    .limit(1);
  if (!recipient || recipient.account.email !== context.reviewedEmail)
    throw new Error("Candidate account unavailable.");
  const guard = () =>
    db
      .insert(workflowExecutionGuards)
      .values({
        runId: run.id,
        lockToken: leaseToken,
        checkedAt: new Date().toISOString(),
      });
  let [delivery] = await db
    .select()
    .from(telegramDeliveries)
    .where(
      and(
        eq(telegramDeliveries.runId, run.id),
        eq(telegramDeliveries.nodeId, nodeId),
      ),
    )
    .limit(1);
  if (!delivery) {
    const id = crypto.randomUUID();
    let cipher: string | null = null;
    const statements: Parameters<typeof db.batch>[0][number][] = [guard()];
    if (
      context.activationRequired &&
      context.userId === `wf_${run.id}` &&
      recipient.profile.mustChangePassword
    ) {
      const token = activationToken();
      cipher = await encryptActivation(token, activationSecret());
      statements.push(
        db
          .insert(accountActivations)
          .values({
            id: run.id,
            userId: context.userId,
            ownerEmail: run.ownerEmail,
            tokenHash: await tokenHash(token),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: now,
          }),
      );
    }
    statements.push(
      db
        .insert(telegramDeliveries)
        .values({
          id,
          runId: run.id,
          nodeId,
          ownerEmail: run.ownerEmail,
          chatId: connection.chatId,
          tokenCipher: cipher,
          createdAt: now,
          updatedAt: now,
        }),
    );
    await db.batch(
      statements as [(typeof statements)[number], ...typeof statements],
    );
    [delivery] = await db
      .select()
      .from(telegramDeliveries)
      .where(eq(telegramDeliveries.id, id))
      .limit(1);
  }
  if (delivery.status === "sent") return "sent";
  if (delivery.status === "sending" || delivery.status === "uncertain") {
    await db
      .update(telegramDeliveries)
      .set({
        status: "uncertain",
        errorMessage:
          "Delivery is uncertain. Confirm with the candidate before resending.",
        updatedAt: now,
      })
      .where(eq(telegramDeliveries.id, delivery.id));
    throw new TelegramSendError("uncertain");
  }
  if (delivery.chatId !== connection.chatId)
    throw new TelegramSendError("permanent");
  if (delivery.nextAttemptAt && delivery.nextAttemptAt > now) {
    context.waitingFor = "telegram_retry";
    return "waiting";
  }
  const runtime = telegramRuntime();
  const origin = runtime.BETTER_AUTH_URL ?? "http://localhost:5173";
  let url = `${origin}/sign-in?return_to=%2Fportal`,
    button = "Sign in & open forms";
  if (delivery.tokenCipher && recipient.profile.mustChangePassword) {
    const [activation] = await db
      .select()
      .from(accountActivations)
      .where(eq(accountActivations.id, run.id))
      .limit(1);
    if (!activation || activation.expiresAt <= now) {
      // A retry explicitly requested by HR may replace an unused expired invitation.
      if (activation?.usedAt) throw new TelegramSendError("permanent");
      const token = activationToken(),
        cipher = await encryptActivation(token, activationSecret());
      await db.batch([
        guard(),
        db
          .update(accountActivations)
          .set({
            tokenHash: await tokenHash(token),
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          })
          .where(
            and(
              eq(accountActivations.id, run.id),
              sql`${accountActivations.usedAt} IS NULL`,
            ),
          ),
        db
          .update(telegramDeliveries)
          .set({ tokenCipher: cipher })
          .where(eq(telegramDeliveries.id, delivery.id)),
      ]);
      delivery.tokenCipher = cipher;
    }
    url = `${origin}/activate#${await decryptActivation(delivery.tokenCipher!, activationSecret())}`;
    button = "Activate account & open forms";
  }
  const assignments = await db
    .select({ id: formAssignments.id })
    .from(formAssignments)
    .where(and(eq(formAssignments.userId, context.userId), run.applicationId ? eq(formAssignments.applicationId, run.applicationId) : sql`${formAssignments.applicationId} IS NULL`));
  const text = invitationText(
    config.message ?? DEFAULT_TELEGRAM_MESSAGE,
    context.reviewedName ?? recipient.account.name,
    recipient.account.email,
    assignments.length,
  );
  const result = await db.batch([
    guard(),
    db
      .update(telegramDeliveries)
      .set({ status: "sending", errorMessage: null, updatedAt: now })
      .where(
        and(
          eq(telegramDeliveries.id, delivery.id),
          sql`${telegramDeliveries.status} IN ('pending','failed')`,
        ),
      )
      .returning({ id: telegramDeliveries.id }),
  ]);
  if (!result[1].length) throw new TelegramSendError("uncertain");
  try {
    const response = await sendBotMessage(connection.chatId, text, url, button);
    await db
      .update(telegramDeliveries)
      .set({
        status: "sent",
        messageId: String(response.message_id),
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(telegramDeliveries.id, delivery.id));
    delete context.waitingFor;
    return "sent";
  } catch (error) {
    const safe =
      error instanceof TelegramSendError
        ? error
        : new TelegramSendError("uncertain");
    await db
      .update(telegramDeliveries)
      .set({
        status: safe.kind === "uncertain" ? "uncertain" : "failed",
        errorMessage: safe.message,
        nextAttemptAt:
          safe.kind === "retryable"
            ? new Date(Date.now() + safe.retryAfter * 1000).toISOString()
            : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(telegramDeliveries.id, delivery.id));
    if (safe.kind === "retryable") {
      context.waitingFor = "telegram_retry";
      return "waiting";
    }
    throw safe;
  }
}
export function activationSecret() {
  const r = telegramRuntime();
  if (r.BETTER_AUTH_SECRET) return r.BETTER_AUTH_SECRET;
  if (r.ENVIRONMENT !== "production")
    return "pdf-builder-local-development-secret-change-before-production";
  throw new Error("Activation configuration unavailable.");
}
