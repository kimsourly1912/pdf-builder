import "server-only";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { candidates, candidateResumeLinks, resumes } from "@/db/schema";
import {
  emptyCandidateInsert,
  safeResumeFileName,
} from "@/features/resumes/resume.server";
import { inspectPdf } from "@/features/templates/file-validation";
import { getFilesBucket } from "@/features/templates/template.server";
import {
  MAX_RESUME_BYTES,
  MAX_RESUME_PAGES,
} from "@/features/resumes/resume.types";
import { sha256Hex } from "@/features/templates/submission-artifact";
import {
  botConfiguration,
  downloadTelegramPdf,
  sendBotMessage,
  telegramRuntime,
} from "./bot.server";
import {
  telegramConnections,
  telegramIntakes,
  telegramUpdates,
  telegramUpdateGuards,
} from "./schema";
import {
  parseTelegramUpdate,
  validIntakeEmail,
  validIntakeName,
  type TelegramUpdate,
} from "./telegram";

export async function receiveTelegramUpdate(update: TelegramUpdate) {
  const now = new Date().toISOString();
  await getDb()
    .insert(telegramUpdates)
    .values({
      id: update.update_id,
      chatId: String(update.message.chat.id),
      payloadJson: JSON.stringify(update),
      createdAt: now,
    })
    .onConflictDoNothing();
}
export async function processTelegramUpdates() {
  if (!botConfiguration().configured) return;
  const now = new Date().toISOString();
  const pending = await getDb()
    .select({ id: telegramUpdates.id })
    .from(telegramUpdates)
    .where(
      and(
        or(
          eq(telegramUpdates.status, "queued"),
          eq(telegramUpdates.status, "processing"),
        ),
        or(
          isNull(telegramUpdates.lockedUntil),
          lt(telegramUpdates.lockedUntil, now),
        ),
      ),
    )
    .orderBy(telegramUpdates.id)
    .limit(20);
  for (const item of pending) await processTelegramUpdate(item.id);
}
export async function processTelegramUpdate(id: number) {
  const db = getDb(),
    now = new Date().toISOString(),
    token = crypto.randomUUID();
  const [claimed] = await db
    .update(telegramUpdates)
    .set({
      status: "processing",
      lockToken: token,
      lockedUntil: new Date(Date.now() + 300000).toISOString(),
      attempts: sql`${telegramUpdates.attempts}+1`,
    })
    .where(
      and(
        eq(telegramUpdates.id, id),
        or(
          eq(telegramUpdates.status, "queued"),
          eq(telegramUpdates.status, "processing"),
        ),
        or(
          isNull(telegramUpdates.lockedUntil),
          lt(telegramUpdates.lockedUntil, now),
        ),
        sql`NOT EXISTS (SELECT 1 FROM telegram_updates earlier WHERE earlier.chat_id=${telegramUpdates.chatId} AND earlier.id<${telegramUpdates.id} AND earlier.status IN ('queued','processing'))`,
      ),
    )
    .returning();
  if (!claimed) return;
  const update = parseTelegramUpdate(JSON.parse(claimed.payloadJson));
  const ownerEmail = telegramRuntime().MANAGEMENT_EMAIL?.trim().toLowerCase();
  if (!update || !ownerEmail) {
    await db
      .update(telegramUpdates)
      .set({
        status: "failed",
        lockToken: null,
        lockedUntil: null,
        errorMessage: "Intake configuration or update is unavailable.",
      })
      .where(
        and(eq(telegramUpdates.id, id), eq(telegramUpdates.lockToken, token)),
      );
    return;
  }
  const guard = () =>
    db.insert(telegramUpdateGuards).values({
      updateId: id,
      lockToken: token,
      checkedAt: new Date().toISOString(),
    });
  const done = () =>
    db
      .update(telegramUpdates)
      .set({
        status: "completed",
        payloadJson: "{}",
        lockToken: null,
        lockedUntil: null,
        errorMessage: null,
      })
      .where(
        and(eq(telegramUpdates.id, id), eq(telegramUpdates.lockToken, token)),
      );
  let fileKey: string | null = null;
  try {
    const m = update.message,
      chatId = String(m.chat.id),
      text = m.text?.trim() ?? "";
    let [connection] = await db
      .select()
      .from(telegramConnections)
      .where(
        and(
          eq(telegramConnections.ownerEmail, ownerEmail),
          eq(telegramConnections.chatId, chatId),
        ),
      )
      .limit(1);
    let reply = "";
    if (text.startsWith("/start") || !connection) {
      if (!connection) {
        connection = {
          id: crypto.randomUUID(),
          ownerEmail,
          chatId,
          username: m.from.username ?? "",
          fullName: "",
          email: "",
          stage: "name",
          candidateId: null,
          confirmedCandidateId: null,
          confirmedBy: null,
          confirmedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        await db.batch([
          guard(),
          db.insert(telegramConnections).values(connection),
          done(),
        ]);
      } else
        await db.batch([
          guard(),
          db
            .update(telegramConnections)
            .set({
              stage: "name",
              username: m.from.username ?? "",
              confirmedCandidateId: null,
              confirmedBy: null,
              confirmedAt: null,
              updatedAt: now,
            })
            .where(eq(telegramConnections.id, connection.id)),
          done(),
        ]);
      reply =
        "Welcome to ANG HR recruitment. Please send your full name. Your contact details and PDF will be stored for HR review. AI analysis starts only when HR requests it.";
    } else if (text === "/status") {
      await db.batch([guard(), done()]);
      reply = connection.candidateId
        ? "Your CV is saved for HR review. HR will send an invitation after approval."
        : "Please complete your name, email, and PDF CV submission. Use /start to begin again.";
    } else if (connection.stage === "name") {
      if (!validIntakeName(text)) {
        await db.batch([guard(), done()]);
        reply = "Please send a full name between 2 and 120 characters.";
      } else {
        await db.batch([
          guard(),
          db
            .update(telegramConnections)
            .set({ fullName: text, stage: "email", updatedAt: now })
            .where(eq(telegramConnections.id, connection.id)),
          done(),
        ]);
        reply = "Thank you. Please send your email address.";
      }
    } else if (connection.stage === "email") {
      if (!validIntakeEmail(text)) {
        await db.batch([guard(), done()]);
        reply =
          "Please send a valid email address, for example name@gmail.com.";
      } else {
        await db.batch([
          guard(),
          db
            .update(telegramConnections)
            .set({ email: text.toLowerCase(), stage: "pdf", updatedAt: now })
            .where(eq(telegramConnections.id, connection.id)),
          done(),
        ]);
        reply =
          "Please upload your CV as a PDF document, up to 15 MB and 20 pages. Uploading does not create a login account or run AI.";
      }
    } else {
      const document = m.document;
      if (
        !document ||
        !(document.file_name ?? "").toLowerCase().endsWith(".pdf") ||
        (document.file_size ?? 0) > MAX_RESUME_BYTES
      ) {
        await db.batch([guard(), done()]);
        reply = "Please upload a PDF document up to 15 MB and 20 pages.";
      } else {
        const bytes = await downloadTelegramPdf(document.file_id);
        const inspected = await inspectPdf(bytes);
        if (!inspected || inspected.pageCount > MAX_RESUME_PAGES) {
          await db.batch([guard(), done()]);
          reply =
            "This PDF is invalid, password-protected, or exceeds 20 pages. Please upload another PDF.";
        } else {
          const checksum = await sha256Hex(bytes);
          const [duplicatePdf] = await db
            .select({ id: resumes.id })
            .from(resumes)
            .where(
              and(
                eq(resumes.ownerEmail, ownerEmail),
                eq(resumes.checksum, checksum),
              ),
            )
            .limit(1);
          if (duplicatePdf) {
            await db.batch([guard(), done()]);
            reply =
              "This PDF has already been received. Please ask HR if you need to update your submission.";
          } else {
            const [previousCandidate] = connection.candidateId
              ? await db
                  .select({ id: candidates.id })
                  .from(candidates)
                  .where(
                    and(
                      eq(candidates.id, connection.candidateId),
                      eq(candidates.ownerEmail, ownerEmail),
                    ),
                  )
                  .limit(1)
              : [];
            const resumeId = crypto.randomUUID(),
              candidateId = previousCandidate?.id ?? crypto.randomUUID();
            const [duplicateCandidate] = await db
              .select({ id: candidates.id })
              .from(candidates)
              .where(
                and(
                  eq(candidates.ownerEmail, ownerEmail),
                  eq(candidates.normalizedEmail, connection.email),
                  sql`${candidates.id} <> ${candidateId}`,
                ),
              )
              .limit(1);
            fileKey = `resumes/${resumeId}/original.pdf`;
            await getFilesBucket().put(fileKey, bytes.buffer as ArrayBuffer, {
              httpMetadata: { contentType: "application/pdf" },
            });
            const statements: Parameters<typeof db.batch>[0][number][] = [
              guard(),
            ];
            if (!previousCandidate)
              statements.push(
                db.insert(candidates).values({
                  ...emptyCandidateInsert({
                    id: candidateId,
                    ownerEmail,
                    now,
                  }),
                  fullName: connection.fullName,
                  email: connection.email,
                  normalizedEmail: connection.email,
                }),
              );
            statements.push(
              db.insert(resumes).values({
                id: resumeId,
                ownerEmail,
                candidateId,
                duplicateCandidateId: duplicateCandidate?.id ?? null,
                fileKey,
                fileName: safeResumeFileName(document.file_name ?? "CV.pdf"),
                fileSize: bytes.length,
                contentType: "application/pdf",
                checksum,
                pageCount: inspected.pageCount,
                source: "telegram",
                receivedDate: now.slice(0, 10),
                note: "Submitted through the recruitment bot. AI extraction has not been requested.",
                status: duplicateCandidate
                  ? "possible_duplicate"
                  : "needs_attention",
                verificationStatus: "unverified",
                createdAt: now,
                updatedAt: now,
              }),
              db.insert(candidateResumeLinks).values({
                id: crypto.randomUUID(),
                candidateId,
                resumeId,
                createdAt: now,
                createdByEmail: ownerEmail,
                linkType: "telegram_intake",
              }),
              db.insert(telegramIntakes).values({
                id: crypto.randomUUID(),
                ownerEmail,
                connectionId: connection.id,
                candidateId,
                resumeId,
                updateId: id,
                createdAt: now,
              }),
              db
                .update(telegramConnections)
                .set({ candidateId, updatedAt: now })
                .where(eq(telegramConnections.id, connection.id)),
              done(),
            );
            await db.batch(
              statements as [(typeof statements)[number], ...typeof statements],
            );
            fileKey = null;
            reply =
              "CV received. Awaiting HR review. No AI analysis or login account has been created. You can send a newer PDF here if needed.";
          }
        }
      }
    }
    // A failed acknowledgement never replays the completed intake transaction.
    await sendBotMessage(chatId, reply).catch(() =>
      console.warn("Telegram intake acknowledgement unavailable", {
        updateId: id,
      }),
    );
  } catch {
    if (fileKey)
      await getFilesBucket()
        .delete(fileKey)
        .catch(() => undefined);
    await db
      .update(telegramUpdates)
      .set({
        status: claimed.attempts >= 5 ? "failed" : "queued",
        lockToken: null,
        lockedUntil: new Date(Date.now() + 60000).toISOString(),
        errorMessage:
          "Intake processing could not finish. The candidate may restart the bot.",
      })
      .where(
        and(eq(telegramUpdates.id, id), eq(telegramUpdates.lockToken, token)),
      );
    console.error("Telegram intake processing failed", { updateId: id });
  }
}
export async function intakeList(ownerEmail: string, query: URLSearchParams) {
  const rows = await getDb()
    .select({
      intake: telegramIntakes,
      connection: telegramConnections,
      candidate: candidates,
      resume: resumes,
    })
    .from(telegramIntakes)
    .innerJoin(
      telegramConnections,
      eq(telegramConnections.id, telegramIntakes.connectionId),
    )
    .innerJoin(candidates, eq(candidates.id, telegramIntakes.candidateId))
    .innerJoin(resumes, eq(resumes.id, telegramIntakes.resumeId))
    .where(eq(telegramIntakes.ownerEmail, ownerEmail))
    .orderBy(desc(telegramIntakes.createdAt))
    .limit(200);
  const search = query.get("search")?.trim().toLowerCase() ?? "",
    status = query.get("status");
  return rows
    .filter(
      (r) =>
        (!search ||
          `${r.connection.fullName} ${r.connection.email} ${r.connection.username} ${r.resume.fileName}`
            .toLowerCase()
            .includes(search)) &&
        (!status || status === "all" || r.intake.extractionStatus === status),
    )
    .map((r) => ({
      id: r.intake.id,
      resumeId: r.resume.id,
      fileName: r.resume.fileName,
      fullName: r.connection.fullName,
      email: r.connection.email,
      username: r.connection.username,
      extractionStatus:
        r.intake.extractionStatus === "processing" &&
        r.intake.extractionUntil &&
        r.intake.extractionUntil < new Date().toISOString()
          ? "failed"
          : r.intake.extractionStatus,
      confirmed: r.connection.confirmedCandidateId === r.candidate.id,
      accountCreated: !!r.candidate.userId,
      possibleDuplicate: !!r.resume.duplicateCandidateId,
      createdAt: r.intake.createdAt,
    }));
}
export async function getIntake(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select({
      intake: telegramIntakes,
      connection: telegramConnections,
      candidate: candidates,
      resume: resumes,
    })
    .from(telegramIntakes)
    .innerJoin(
      telegramConnections,
      eq(telegramConnections.id, telegramIntakes.connectionId),
    )
    .innerJoin(candidates, eq(candidates.id, telegramIntakes.candidateId))
    .innerJoin(resumes, eq(resumes.id, telegramIntakes.resumeId))
    .where(
      and(
        eq(telegramIntakes.id, id),
        eq(telegramIntakes.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  return row;
}
