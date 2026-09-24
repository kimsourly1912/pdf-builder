import { and, eq } from "drizzle-orm";

import { getDatabaseBinding, getDb } from "@/db";
import { candidateProfileVersions, candidates, recipientProfiles } from "@/db/schema";
import { createAuditEvent } from "@/features/audit/audit.server";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id: accountId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const profileVersionId = typeof body.candidateProfileVersionId === "string"
      ? body.candidateProfileVersionId.trim()
      : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(profileVersionId)) {
      return jsonError("Choose a resume profile to link.", 400);
    }
    const db = getDb();
    const [account] = await db.select({ id: recipientProfiles.userId })
      .from(recipientProfiles)
      .where(and(
        eq(recipientProfiles.userId, accountId),
        eq(recipientProfiles.createdByEmail, ownerEmail),
      )).limit(1);
    if (!account) return jsonError("Recipient account not found.", 404);

    const [selected] = await db.select({
      id: candidates.id,
      name: candidates.fullName,
      userId: candidates.userId,
    }).from(candidateProfileVersions)
      .innerJoin(candidates, and(
        eq(candidateProfileVersions.candidateId, candidates.id),
        eq(candidates.ownerEmail, ownerEmail),
      ))
      .where(and(
        eq(candidateProfileVersions.id, profileVersionId),
        eq(candidateProfileVersions.ownerEmail, ownerEmail),
      )).limit(1);
    if (!selected) return jsonError("Resume profile not found.", 404);
    const [current] = await db.select({ id: candidates.id })
      .from(candidates)
      .where(and(
        eq(candidates.ownerEmail, ownerEmail),
        eq(candidates.userId, accountId),
      )).limit(1);
    if (current?.id === selected.id) {
      return Response.json({ linkedCandidate: { id: selected.id, name: selected.name } });
    }
    if (current) {
      return jsonError("This account is already linked to another candidate. Unlink it first.", 409);
    }
    if (selected.userId) {
      return jsonError("This resume candidate is already linked to another account.", 409);
    }

    const now = new Date().toISOString();
    const audit = createAuditEvent({
      request,
      ownerEmail,
      actorType: "owner",
      actorId: ownerEmail,
      action: "account.resume_linked",
      targetType: "account",
      targetId: accountId,
      metadata: { candidateId: selected.id, profileVersionId },
      createdAt: now,
    });
    const results = await getDatabaseBinding().batch([
      getDatabaseBinding().prepare(
        `UPDATE candidates SET user_id = ?, updated_at = ?
         WHERE id = ? AND owner_email = ? AND user_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM candidates WHERE user_id = ? AND owner_email = ?
           )`,
      ).bind(accountId, now, selected.id, ownerEmail, accountId, ownerEmail),
      getDatabaseBinding().prepare(
        `INSERT INTO audit_events (
          id, owner_email, actor_type, actor_id, action, target_type,
          target_id, request_id, metadata_json, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
      ).bind(
        audit.id, audit.ownerEmail, audit.actorType, audit.actorId, audit.action,
        audit.targetType, audit.targetId, audit.requestId, audit.metadataJson,
        audit.createdAt,
      ),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
      return jsonError("The link changed while saving. Refresh and try again.", 409);
    }
    return Response.json({ linkedCandidate: { id: selected.id, name: selected.name } });
  } catch (cause) {
    if (isResponse(cause)) return cause;
    console.error("Failed to link resume candidate to account", cause);
    return jsonError(
      cause instanceof Error && /unique|constraint/iu.test(cause.message)
        ? "This account or resume candidate is already linked."
        : "The resume could not be linked.",
      cause instanceof Error && /unique|constraint/iu.test(cause.message) ? 409 : 500,
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id: accountId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const candidateId = typeof body.expectedCandidateId === "string"
      ? body.expectedCandidateId.trim()
      : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(candidateId)) {
      return jsonError("Refresh the linked candidate before unlinking.", 400);
    }
    const [account] = await getDb().select({ id: recipientProfiles.userId })
      .from(recipientProfiles)
      .where(and(
        eq(recipientProfiles.userId, accountId),
        eq(recipientProfiles.createdByEmail, ownerEmail),
      )).limit(1);
    if (!account) return jsonError("Recipient account not found.", 404);
    const now = new Date().toISOString();
    const audit = createAuditEvent({
      request,
      ownerEmail,
      actorType: "owner",
      actorId: ownerEmail,
      action: "account.resume_unlinked",
      targetType: "account",
      targetId: accountId,
      metadata: { candidateId },
      createdAt: now,
    });
    const database = getDatabaseBinding();
    const results = await database.batch([
      database.prepare(
        `UPDATE candidates SET user_id = NULL, updated_at = ?
         WHERE id = ? AND owner_email = ? AND user_id = ?`,
      ).bind(now, candidateId, ownerEmail, accountId),
      database.prepare(
        `INSERT INTO audit_events (
          id, owner_email, actor_type, actor_id, action, target_type,
          target_id, request_id, metadata_json, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
      ).bind(
        audit.id, audit.ownerEmail, audit.actorType, audit.actorId, audit.action,
        audit.targetType, audit.targetId, audit.requestId, audit.metadataJson,
        audit.createdAt,
      ),
    ]);
    if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
      return jsonError("The link changed while saving. Refresh and try again.", 409);
    }
    return Response.json({ linkedCandidate: null });
  } catch (cause) {
    if (isResponse(cause)) return cause;
    console.error("Failed to unlink resume candidate from account", cause);
    return jsonError("The resume link could not be removed.", 500);
  }
}
