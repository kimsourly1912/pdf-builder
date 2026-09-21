import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  candidateProfileVersions,
  candidates,
  formAssignments,
  recipientLinks,
  recipientProfiles,
  templates,
  templateVersions,
  user,
} from "@/db/schema";
import { createAuditEvent } from "@/features/audit/audit.server";
import { normalizeCandidateProfile } from "@/features/resumes/candidate-profile";
import { buildCandidatePrefillSnapshot } from "@/features/resumes/candidate-prefill";
import { MAX_RESUME_PAGES } from "@/features/resumes/resume.types";
import type { TemplateAnnotation } from "@/features/templates/template.types";
import {
  createRecipientToken,
  hashRecipientToken,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { parseVersionRoles } from "@/features/templates/template-write";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id: userId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const templateId = String(body.templateId ?? "").trim();
    const roleId = String(body.roleId ?? "").trim();
    if (!templateId || !roleId) {
      return jsonError("Choose a template and recipient role.", 400);
    }

    const db = getDb();
    const [account] = await db
      .select({ id: user.id, candidate: candidates })
      .from(recipientProfiles)
      .innerJoin(user, eq(recipientProfiles.userId, user.id))
      .leftJoin(candidates, and(eq(candidates.userId, user.id), eq(candidates.ownerEmail, ownerEmail)))
      .where(
        and(
          eq(recipientProfiles.userId, userId),
          eq(recipientProfiles.createdByEmail, ownerEmail),
        ),
      )
      .limit(1);
    if (!account) return jsonError("Recipient account not found.", 404);

    const [template] = await db
      .select({ template: templates, version: templateVersions })
      .from(templates)
      .innerJoin(
        templateVersions,
        eq(templates.currentVersionId, templateVersions.id),
      )
      .where(
        and(
          eq(templates.id, templateId),
          eq(templates.ownerEmail, ownerEmail),
          isNull(templates.archivedAt),
        ),
      )
      .limit(1);
    if (!template) return jsonError("Template not found.", 404);
    const role = parseVersionRoles(template.version.rolesJson).find(
      (item) => item.id === roleId,
    );
    if (!role) return jsonError("Recipient role not found.", 404);

    const tokenHash = await hashRecipientToken(createRecipientToken());
    const now = new Date().toISOString();
    const linkId = crypto.randomUUID();
    const assignmentId = crypto.randomUUID();
    const annotations = parseArray<TemplateAnnotation>(template.version.annotationsJson);
    const [profileRow] = account.candidate
      ? await db.select().from(candidateProfileVersions).where(and(
          eq(candidateProfileVersions.ownerEmail, ownerEmail),
          eq(candidateProfileVersions.candidateId, account.candidate.id),
        )).orderBy(
          desc(sql<number>`case when ${candidateProfileVersions.verificationStatus} = 'verified' then 1 else 0 end`),
          desc(candidateProfileVersions.versionNumber),
        ).limit(1)
      : [];
    const profile = profileRow
      ? parseProfile(profileRow.profileJson)
      : null;
    const snapshot = buildCandidatePrefillSnapshot({
      candidate: account.candidate,
      annotations,
      profileVersion: profileRow && profile
        ? {
            id: profileRow.id,
            profile,
            verificationStatus: profileRow.verificationStatus === "verified"
              ? "verified"
              : "extracted",
          }
        : null,
    });
    await db.batch([
      db.insert(recipientLinks).values({
        id: linkId,
        templateId,
        templateVersionId: template.version.id,
        roleId: role.id,
        roleName: role.name,
        roleColor: role.color,
        assignedUserId: userId,
        tokenHash,
        status: "active",
        expiresAt: null,
        maxSubmissions: 1,
        submissionCount: 0,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(formAssignments).values({
        id: assignmentId,
        userId,
        templateId,
        templateVersionId: template.version.id,
        recipientLinkId: linkId,
        roleId: role.id,
        roleName: role.name,
        roleColor: role.color,
        initialValuesJson: JSON.stringify(snapshot.values),
        candidateProfileVersionId: profileRow && profile ? profileRow.id : null,
        initialValuesMetaJson: JSON.stringify(snapshot.metadata),
        status: "assigned",
        assignedAt: now,
        updatedAt: now,
      }),
      db.insert(auditEvents).values(
        createAuditEvent({
          request,
          ownerEmail,
          actorType: "owner",
          actorId: ownerEmail,
          action: "assignment.created",
          targetType: "assignment",
          targetId: assignmentId,
          metadata: {
            accountId: userId,
            roleId: role.id,
            templateId,
            versionNumber: template.version.versionNumber,
            candidateProfileVersionId: profileRow && profile ? profileRow.id : null,
            prefilledFieldCount: Object.keys(snapshot.values).length,
          },
          createdAt: now,
        }),
      ),
    ]);

    return Response.json(
      {
        assignment: {
          id: assignmentId,
          templateId,
          templateName: template.template.name,
          versionNumber: template.version.versionNumber,
          roleId: role.id,
          roleName: role.name,
          roleColor: role.color,
          status: "active",
          assignedAt: now,
          completedAt: null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to assign recipient form", error);
    const duplicate = error instanceof Error && /unique|constraint/iu.test(error.message);
    return jsonError(
      duplicate
        ? "This version and role are already assigned to this account."
        : "The form could not be assigned.",
      duplicate ? 409 : 500,
    );
  }
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}


function parseProfile(value: string) {
  try {
    return normalizeCandidateProfile(JSON.parse(value) as unknown, MAX_RESUME_PAGES);
  } catch {
    return null;
  }
}
