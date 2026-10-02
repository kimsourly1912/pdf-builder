import {
  archiveStatements,
  isArchived,
} from "@/features/archive/archive.server";
import { uploadWorkflowStatements } from "@/features/workflows/workflow.server";
import { notArchived } from "@/features/archive/archive";
import "server-only";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, getDatabaseBinding } from "@/db";
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
    if (text.startsWith("/start") && connection?.candidateId) {
      await db.batch([guard(), done()]);
      reply =
        "Your candidate details are already saved. Use /replace_cv to replace an unreviewed CV, /add_cv to submit an additional CV, /update_details to edit contact details, or /status to check receipt.";
    } else if (text === "/update_details" && connection) {
      await db.batch([
        guard(),
        db
          .update(telegramConnections)
          .set({
            stage: "name",
            submissionMode: connection.candidateId ? "completed" : "initial",
            confirmedCandidateId: null,
            confirmedBy: null,
            confirmedAt: null,
            updatedAt: now,
          })
          .where(eq(telegramConnections.id, connection.id)),
        done(),
      ]);
      reply = "Please send your updated full name.";
    } else if (text.startsWith("/start") || !connection) {
      if (!connection) {
        connection = {
          id: crypto.randomUUID(),
          ownerEmail,
          chatId,
          username: m.from.username ?? "",
          fullName: "",
          email: "",
          stage: "name",
          submissionMode: "initial",
          lastIntakeId: null,
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
    } else if (["/add_cv", "/replace_cv", "/cancel"].includes(text)) {
      if (!connection.candidateId || connection.stage !== "pdf") {
        await db.batch([guard(), done()]);
        reply = "Complete your full name and email first.";
      } else {
        await db.batch([
          guard(),
          db
            .update(telegramConnections)
            .set({
              submissionMode:
                text === "/cancel"
                  ? "completed"
                  : text === "/replace_cv"
                    ? "replace"
                    : "add",
              updatedAt: now,
            })
            .where(eq(telegramConnections.id, connection.id)),
          done(),
        ]);
        reply =
          text === "/cancel"
            ? "CV upload cancelled. Your saved CVs are unchanged."
            : text === "/replace_cv"
              ? "Upload the replacement PDF. Only your latest unverified CV can be replaced; the previous PDF will remain archived for HR."
              : "Upload an additional PDF. It will be added to your existing candidate and CV history.";
      }
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
    } else if (connection.submissionMode === "completed") {
      await db.batch([guard(), done()]);
      reply =
        "Your CV is already saved. Choose /replace_cv to replace the latest unreviewed CV, or /add_cv to add another CV. This message did not create another submission.";
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
            const intakeId = crypto.randomUUID();
            const replacement =
              connection.submissionMode === "replace" && connection.lastIntakeId
                ? await getIntake(ownerEmail, connection.lastIntakeId)
                : null;
            if (
              connection.submissionMode === "replace" &&
              (!replacement ||
                replacement.resume.verificationStatus === "verified" ||
                (await isArchived("resume", replacement.resume.id)))
            ) {
              await db.batch([guard(), done()]);
              await sendBotMessage(
                chatId,
                "That CV has been reviewed or archived. Use /add_cv to submit another PDF without changing its history.",
              );
              return;
            }
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
                id: intakeId,
                ownerEmail,
                connectionId: connection.id,
                candidateId,
                resumeId,
                updateId: id,
                createdAt: now,
              }),
              db
                .update(telegramConnections)
                .set({
                  candidateId,
                  submissionMode: "completed",
                  lastIntakeId: intakeId,
                  updatedAt: now,
                })
                .where(eq(telegramConnections.id, connection.id)),
              done(),
            );
            statements.push(
              ...(await uploadWorkflowStatements(
                ownerEmail,
                resumeId,
                now,
                "telegram_submission",
              )),
            );
            const binding = getDatabaseBinding(),
              raw = statements.map((q) => {
                const prepared = (
                  q as unknown as {
                    toSQL(): { sql: string; params: unknown[] };
                  }
                ).toSQL();
                return binding.prepare(prepared.sql).bind(...prepared.params);
              });
            if (replacement) {
              raw.unshift(
                binding
                  .prepare(
                    "INSERT INTO telegram_replacement_guards(resume_id,owner_email,resume_revision) VALUES(?,?,?)",
                  )
                  .bind(
                    replacement.resume.id,
                    ownerEmail,
                    replacement.resume.updatedAt,
                  ),
              );
              raw.push(
                ...(await archiveStatements(
                  ownerEmail,
                  "intake",
                  replacement.intake.id,
                  now,
                )),
              );
            }
            await binding.batch(raw);
            fileKey = null;
            reply =
              "CV received. Awaiting HR review. No AI analysis or login account has been created. Use /replace_cv or /add_cv if you need to submit another PDF.";
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
    .innerJoin(resumes, eq(resumes.id, telegramIntakes.resumeId))
    .innerJoin(candidates, eq(candidates.id, resumes.candidateId))
    .where(
      and(
        eq(telegramIntakes.ownerEmail, ownerEmail),
        notArchived("intake", telegramIntakes.id),
        notArchived("resume", resumes.id),
      ),
    )
    .orderBy(desc(telegramIntakes.createdAt), desc(telegramIntakes.updateId))
    .limit(200);
  const search = query.get("search")?.trim().toLowerCase() ?? "",
    status = query.get("status");
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows)
    if (!latest.has(row.connection.id)) latest.set(row.connection.id, row);
  const counts = await getDatabaseBinding()
    .prepare(
      "SELECT i.connection_id,count(*) cvCount,sum(CASE WHEN r.verification_status='verified' THEN 1 ELSE 0 END) verifiedCvCount FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id WHERE i.owner_email=? AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE (ar.entity_type='intake' AND ar.entity_id=i.id) OR (ar.entity_type='resume' AND ar.entity_id=r.id)) GROUP BY i.connection_id",
    )
    .bind(ownerEmail)
    .all<{ connection_id: string; cvCount: number; verifiedCvCount: number }>();
  const countMap = new Map(
    (counts.results ?? []).map((c) => [c.connection_id, c]),
  );
  return [...latest.values()]
    .filter(
      (r) =>
        (!search ||
          `${r.connection.fullName} ${r.connection.email} ${r.connection.username} ${r.resume.fileName}`
            .toLowerCase()
            .includes(search)) &&
        (!status ||
          status === "all" ||
          (status === "verified"
            ? r.resume.verificationStatus === "verified"
            : r.resume.verificationStatus !== "verified")),
    )
    .map((r) => ({
      id: r.intake.id,
      reviewStatus:
        r.resume.verificationStatus === "verified"
          ? "verified"
          : "needs_review",
      cvCount: countMap.get(r.connection.id)?.cvCount ?? 1,
      verifiedCvCount: countMap.get(r.connection.id)?.verifiedCvCount ?? 0,
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
    .innerJoin(resumes, eq(resumes.id, telegramIntakes.resumeId))
    .innerJoin(candidates, eq(candidates.id, resumes.candidateId))
    .where(
      and(
        eq(telegramIntakes.id, id),
        eq(telegramIntakes.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  return row;
}
