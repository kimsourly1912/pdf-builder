import { STAGE_LABELS } from "@/features/candidate-progress/progress";
import { confirmBotCvUpdate, cvIsProtected, getCvUpdate } from "@/features/candidate-progress/cv-updates.server";
import { candidateSummary } from "@/features/resumes/resume.server";
import { candidateCvUpdates } from "@/db/schema";
import { progressOverview } from "@/features/candidate-progress/progress.server";
import { candidateNextAction, submissionProgress } from "@/features/candidate-progress/submission-progress";
import {
  uploadWorkflowStatements,
  listWorkflows,
} from "@/features/workflows/workflow.server";
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
      rawText = m.text?.trim() ?? "",
      text =
        (
          {
            "Add another CV": "/add_cv",
            "Replace unreviewed CV": "/replace_cv",
            "Check application status": "/status",
            "Request a CV update": "/update_cv",
            "Update submitted CV": "/update_cv",
            "Request a profile update": "/update_cv",
            "Send update to HR": "/confirm_cv",
            "Confirm replacement": "/confirm_cv",
            "Cancel upload": "/cancel",
            "Open forms": "/forms",
          } as Record<string, string>
        )[rawText] ?? rawText;
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
    let menu: string[] | undefined;
    let replyUrl: string | undefined;
    if (text.startsWith("/start") && connection?.candidateId) {
      await db.batch([guard(), done()]);
      reply =
        "Your candidate details are already saved. Check your status or request a CV update using the buttons below.";
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
      const progress = connection.candidateId
        ? (await progressOverview(ownerEmail)).find(
            (p) => p.id === connection.candidateId,
          )
        : null;
      reply = progress
        ? `Application status: ${progress.automaticStage === "new" ? "Needs review" : STAGE_LABELS[progress.automaticStage]}.\nCurrent CV: ${progress.currentCv?.fileName ?? progress.selectedCv.fileName}\n${progress.facts.required ? `${progress.facts.completed}/${progress.facts.required} required forms submitted.` : "HR will contact you about the next step."}${progress.facts.invitationSent ? "\nInvitation sent through Telegram. This does not indicate whether it was read." : ""}`
        : connection.candidateId
          ? "Your saved application is with HR. Contact HR for an update."
          : "Please complete your name, email, and PDF CV submission. Use /start to begin again.";
    } else if (text === "/forms") {
      await db.batch([guard(), done()]);
      reply = "Sign in to your account to complete your assigned forms. If you have not activated your account, use the activation invitation previously sent by HR.";
      replyUrl = `${telegramRuntime().BETTER_AUTH_URL?.replace(/\/$/u, "") ?? ""}/portal`;
    } else if (text === "/confirm_cv" || text === "/cancel") {
      const awaiting = await getDatabaseBinding().prepare("SELECT u.resume_id resumeId FROM candidate_cv_updates u JOIN telegram_intakes i ON i.resume_id=u.resume_id WHERE u.owner_email=? AND i.connection_id=? AND u.status='awaiting_confirmation' ORDER BY u.created_at DESC LIMIT 1").bind(ownerEmail, connection.id).first<{resumeId: string}>();
      if (!awaiting) {
        await db.batch([guard(), done()]);
        reply = "No CV upload is waiting for confirmation. Your saved CVs are unchanged.";
        await db.update(telegramConnections).set({submissionMode: connection.candidateId ? "completed" : "initial", updatedAt: now}).where(eq(telegramConnections.id, connection.id));
      } else {
        const status = await confirmBotCvUpdate(ownerEmail, awaiting.resumeId, text === "/cancel");
        await db.batch([guard(), db.update(telegramConnections).set({submissionMode: "completed", updatedAt: now}).where(eq(telegramConnections.id, connection.id)), done()]);
        reply = status === "cancelled" ? "CV upload cancelled. Your current application is unchanged."
          : status === "replaced" ? "Your submitted CV was updated. The previous PDF was archived. HR will review the new CV."
          : "Your updated CV has been sent to HR for review. Your current application CV, account and assigned forms remain active. You can continue completing your forms.";
      }
    } else if (["/update_cv", "/add_cv", "/replace_cv"].includes(text)) {
      const awaiting = await getDatabaseBinding().prepare("SELECT 1 pending FROM candidate_cv_updates u JOIN telegram_intakes i ON i.resume_id=u.resume_id WHERE u.owner_email=? AND i.connection_id=? AND u.status IN ('awaiting_confirmation','pending','reviewing') AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=u.resume_id) LIMIT 1").bind(ownerEmail, connection.id).first();
      if (!connection.candidateId || connection.stage !== "pdf") {
        await db.batch([guard(), done()]);
        reply = "Complete your full name and email first.";
      } else if (awaiting) {
        await db.batch([guard(), done()]);
        reply = "You already have a CV update waiting for confirmation or HR review. Check your status before sending another.";
      } else {
        await db.batch([guard(), db.update(telegramConnections).set({submissionMode: "update", updatedAt: now}).where(eq(telegramConnections.id, connection.id)), done()]);
        reply = "Upload your updated CV as a PDF (up to 15 MB and 20 pages). We will ask you to confirm before saving it as a replacement or sending an update request to HR. Use /cancel to stop.";
        menu = ["Cancel upload", "Check application status"];
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
    } else if (["completed", "confirm_update"].includes(connection.submissionMode)) {
      await db.batch([guard(), done()]);
      reply =
        "Your CV is already saved. Use the update button to submit a new version for confirmation. This message did not change your application.";
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
            const application = previousCandidate ? (await progressOverview(ownerEmail)).find(p => p.id === previousCandidate.id) : null;
            const baseResumeId = application?.currentCv?.id ?? application?.selectedCv.id;
            const isUpdate = !!baseResumeId;
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
                  submissionMode: isUpdate ? "confirm_update" : "completed",
                  lastIntakeId: intakeId,
                  updatedAt: now,
                })
                .where(eq(telegramConnections.id, connection.id)),
              done(),
            );
            if (isUpdate && baseResumeId) {
              const [existingCandidate] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
              statements.push(db.insert(candidateCvUpdates).values({resumeId, candidateId, ownerEmail, baseResumeId, status: "awaiting_confirmation", draftJson: (await getCvUpdate(ownerEmail, baseResumeId))?.draftJson ?? JSON.stringify(candidateSummary(existingCandidate)), createdAt: now, updatedAt: now}));
              // Pin the application CV before a newer upload can become the default selection.

            } else statements.push(...await uploadWorkflowStatements(ownerEmail, resumeId, now, "telegram_submission"));
            const binding = getDatabaseBinding(),
              raw = statements.map((q) => {
                const prepared = (
                  q as unknown as {
                    toSQL(): { sql: string; params: unknown[] };
                  }
                ).toSQL();
                return binding.prepare(prepared.sql).bind(...prepared.params);
              });
            if (isUpdate && application) raw.push(binding.prepare("INSERT INTO candidate_progress(candidate_id,owner_email,selected_resume_id,version,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(candidate_id) DO NOTHING").bind(candidateId, ownerEmail, application.selectedCv.id, now));
            await binding.batch(raw);
            connection.candidateId = candidateId;
            fileKey = null;
            if (isUpdate && baseResumeId) {
              const protectedCv = await cvIsProtected(ownerEmail, baseResumeId);
              reply = protectedCv
                ? `Send ${safeResumeFileName(document.file_name ?? "CV.pdf")} to HR as a CV update? Your current application CV, approval and forms remain active.`
                : `Replace ${application!.selectedCv.fileName} with ${safeResumeFileName(document.file_name ?? "CV.pdf")}? The previous unreviewed PDF will be archived. If HR starts review before confirmation, this will become a separate update request.`;
              menu = [protectedCv ? "Send update to HR" : "Confirm replacement", "Cancel upload"];
            } else reply = "CV received. Awaiting HR review. No AI analysis or new login account was created by this upload. Use the buttons below to check status or update your CV.";
          }
        }
      }
    }
    if (!menu && connection?.candidateId) {
      const awaiting = await getDatabaseBinding().prepare("SELECT 1 pending FROM candidate_cv_updates u JOIN telegram_intakes i ON i.resume_id=u.resume_id WHERE u.owner_email=? AND i.connection_id=? AND u.status='awaiting_confirmation' AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=u.resume_id) LIMIT 1").bind(ownerEmail, connection.id).first();
      const progress = (await progressOverview(ownerEmail)).find(p => p.id === connection!.candidateId);
      menu = awaiting ? ["Send update to HR", "Cancel upload", "Check application status"]
        : [...(progress?.accountCreated && !progress.accountDisabled ? ["Open forms"] : []), progress?.automaticStage === "accepted" ? "Request a profile update" : progress && (await cvIsProtected(ownerEmail, progress.selectedCv.id)) ? "Request a CV update" : "Update submitted CV", "Check application status"];
      if (text === "/status") {
        if (progress?.accountDisabled) reply += "\nYour account access needs HR assistance. Please contact HR.";
        const pending = await getDatabaseBinding().prepare("SELECT status FROM candidate_cv_updates WHERE candidate_id=? AND owner_email=? AND status IN ('awaiting_confirmation','pending','reviewing') AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='resume' AND a.entity_id=candidate_cv_updates.resume_id) ORDER BY created_at DESC LIMIT 1").bind(connection.candidateId, ownerEmail).first<{status: string}>();
        if (pending) reply += pending.status === "awaiting_confirmation" ? "\nYour CV update still needs your confirmation." : "\nA CV update is waiting for HR review. Your current application remains active.";
        if (!pending) {
          const decision = await getDatabaseBinding().prepare("SELECT u.status,u.reason,r.file_name fileName FROM candidate_cv_updates u JOIN resumes r ON r.id=u.resume_id WHERE u.candidate_id=? AND u.owner_email=? AND u.status IN ('accepted','declined') ORDER BY u.updated_at DESC LIMIT 1").bind(connection.candidateId, ownerEmail).first<{status: string; reason: string | null; fileName: string}>();
          if (decision) reply += decision.status === "accepted" ? `\nCV update approved: ${decision.fileName}. Existing forms remain unchanged.` : `\nHR kept your current CV.${decision.reason ? ` Reason: ${decision.reason}` : ""}`;
        }

      }
    }
    // A failed acknowledgement never replays the completed intake transaction.
    await sendBotMessage(
      chatId,
      reply,
      replyUrl,
      replyUrl ? "Open forms" : undefined,
      menu ?? (!!connection?.candidateId || reply.startsWith("CV received")),
    ).catch(() =>
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
      reviewReady: sql<number>`EXISTS(SELECT 1 FROM candidate_profile_versions p WHERE p.resume_id=${resumes.id} AND p.candidate_id=${candidates.id} AND p.owner_email=${candidates.ownerEmail} AND p.created_by_email=${candidates.ownerEmail} AND p.verification_status='verified' AND ${resumes.verificationStatus}='verified' AND ${candidates.verificationStatus}='verified' AND ${resumes.duplicateCandidateId} IS NULL AND p.created_at>=${resumes.updatedAt} AND p.created_at>=${candidates.updatedAt})`,
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
        sql`NOT EXISTS(SELECT 1 FROM candidate_cv_updates u WHERE u.resume_id=${resumes.id} AND u.status IN ('awaiting_confirmation','cancelled','declined'))`,
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
      "SELECT i.connection_id,count(*) cvCount,sum(CASE WHEN r.verification_status='verified' AND c.verification_status='verified' AND r.duplicate_candidate_id IS NULL AND EXISTS(SELECT 1 FROM candidate_profile_versions p WHERE p.resume_id=r.id AND p.candidate_id=c.id AND p.owner_email=c.owner_email AND p.created_by_email=c.owner_email AND p.verification_status='verified' AND p.created_at>=r.updated_at AND p.created_at>=c.updated_at) THEN 1 ELSE 0 END) verifiedCvCount FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id JOIN candidates c ON c.id=r.candidate_id WHERE i.owner_email=? AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates u WHERE u.resume_id=r.id AND u.status IN ('awaiting_confirmation','cancelled','declined')) AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE (ar.entity_type='intake' AND ar.entity_id=i.id) OR (ar.entity_type='resume' AND ar.entity_id=r.id)) GROUP BY i.connection_id",
    )
    .bind(ownerEmail)
    .all<{ connection_id: string; cvCount: number; verifiedCvCount: number }>();
  const countMap = new Map(
    (counts.results ?? []).map((c) => [c.connection_id, c]),
  );
  const configured = (await listWorkflows(ownerEmail)).some(
    (w) => w.active && w.version > 0 && w.hasTelegram,
  );
  const progress = new Map(
    (await progressOverview(ownerEmail)).map((p) => {
      const summary = submissionProgress(p);
      if (
        summary.label === "CV approved" &&
        p.contactConfirmed &&
        !configured
      ) {
        summary.next = "Configure workflow";
        summary.href = "/workflows";
      }
      const next = candidateNextAction(p);
      if (p.issues.length) Object.assign(summary, next);
      return [p.id, { ...summary, fileName: p.selectedCv.fileName }];
    }),
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
          (status === "verified" ? !!r.reviewReady : !r.reviewReady)),
    )
    .map((r) => ({
      id: r.intake.id,
      candidateId: r.candidate.id,
      progress: progress.get(r.candidate.id) ?? null,
      reviewStatus: !!r.reviewReady ? "verified" : "needs_review",
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
