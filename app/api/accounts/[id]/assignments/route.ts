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
import {
  buildAssignmentPrefillStorage,
  isAssignmentPrefillMode,
} from "@/features/accounts/assignment-prefill";
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
    const prefillModeProvided = Object.prototype.hasOwnProperty.call(
      body,
      "prefillMode",
    );
    const rawPrefillMode = prefillModeProvided ? body.prefillMode : "automatic";
    if (!isAssignmentPrefillMode(rawPrefillMode)) {
      return jsonError("Resume-data behavior is invalid.", 400);
    }
    const prefillMode = rawPrefillMode;
    const allowedFieldIdsProvided = Object.prototype.hasOwnProperty.call(
      body,
      "allowedFieldIds",
    );
    const rawAllowedFieldIds = body.allowedFieldIds;
    if (
      allowedFieldIdsProvided
      && (
        !Array.isArray(rawAllowedFieldIds)
        || rawAllowedFieldIds.length > 200
        || rawAllowedFieldIds.some(
          (fieldId) =>
            typeof fieldId !== "string"
            || !/^[A-Za-z0-9_-]{1,120}$/u.test(fieldId),
        )
      )
    ) {
      return jsonError("Resume-data field selection is invalid.", 400);
    }
    const allowedFieldIds = allowedFieldIdsProvided
      ? [...new Set(rawAllowedFieldIds as string[])]
      : null;
    const profileSelectionProvided = Object.prototype.hasOwnProperty.call(
      body,
      "candidateProfileVersionId",
    );
    const rawProfileVersionId = body.candidateProfileVersionId;
    if (
      profileSelectionProvided
      && rawProfileVersionId !== null
      && typeof rawProfileVersionId !== "string"
    ) {
      return jsonError("Candidate profile selection is invalid.", 400);
    }
    const requestedProfileVersionId =
      typeof rawProfileVersionId === "string"
        ? rawProfileVersionId.trim()
        : null;
    if (
      !templateId
      || !roleId
      || (requestedProfileVersionId?.length ?? 0) > 128
    ) {
      return jsonError("Choose a template and recipient role.", 400);
    }
    if (
      prefillModeProvided
      && prefillMode !== "none"
      && !requestedProfileVersionId
    ) {
      return jsonError("Choose resume data for this assignment.", 400);
    }
    if (
      prefillMode !== "none"
      && allowedFieldIds !== null
      && allowedFieldIds.length === 0
    ) {
      return jsonError("Choose at least one resume-data field.", 400);
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
    const annotations = parseArray<TemplateAnnotation>(
      template.version.annotationsJson,
    );
    let selectedProfile: {
      version: typeof candidateProfileVersions.$inferSelect;
      candidate: typeof candidates.$inferSelect;
    } | null = null;

    if (prefillMode !== "none" && requestedProfileVersionId) {
      const [selection] = await db
        .select({
          version: candidateProfileVersions,
          candidate: candidates,
        })
        .from(candidateProfileVersions)
        .innerJoin(
          candidates,
          and(
            eq(candidateProfileVersions.candidateId, candidates.id),
            eq(candidateProfileVersions.ownerEmail, candidates.ownerEmail),
          ),
        )
        .where(and(
          eq(candidateProfileVersions.id, requestedProfileVersionId),
          eq(candidateProfileVersions.ownerEmail, ownerEmail),
          eq(candidates.ownerEmail, ownerEmail),
        ))
        .limit(1);
      if (!selection) return jsonError("Candidate profile not found.", 404);
      selectedProfile = selection;
    } else if (
      prefillMode !== "none"
      && !profileSelectionProvided
      && account.candidate
    ) {
      const [version] = await db.select().from(candidateProfileVersions)
        .where(and(
          eq(candidateProfileVersions.ownerEmail, ownerEmail),
          eq(candidateProfileVersions.candidateId, account.candidate.id),
        ))
        .orderBy(
          desc(sql<number>`case when ${candidateProfileVersions.verificationStatus} = 'verified' then 1 else 0 end`),
          desc(candidateProfileVersions.versionNumber),
        )
        .limit(1);
      if (version) {
        selectedProfile = {
          version,
          candidate: account.candidate,
        };
      }
    }

    const profile = selectedProfile
      ? parseProfile(selectedProfile.version.profileJson)
      : null;
    if (selectedProfile && !profile) {
      return jsonError("The selected candidate profile is invalid.", 422);
    }
    const snapshotCandidate = prefillMode === "none"
      ? null
      : profileSelectionProvided
        ? selectedProfile?.candidate ?? null
        : account.candidate;
    const snapshot = buildCandidatePrefillSnapshot({
      candidate: snapshotCandidate,
      annotations,
      recipientRoleId: role.id,
      profileVersion: selectedProfile && profile
        ? {
            id: selectedProfile.version.id,
            profile,
            verificationStatus:
              selectedProfile.version.verificationStatus === "verified"
                ? "verified"
                : "extracted",
          }
        : null,
    });
    const selectedProfileVersionId = selectedProfile && profile
      ? selectedProfile.version.id
      : null;
    const prefillStorage = buildAssignmentPrefillStorage({
      mode: prefillMode,
      snapshot,
      allowedFieldIds: allowedFieldIds ?? Object.keys(snapshot.values),
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
        initialValuesJson: JSON.stringify(prefillStorage.initialValues),
        candidateProfileVersionId: selectedProfileVersionId,
        initialValuesMetaJson: JSON.stringify(prefillStorage.initialMetadata),
        prefillMode,
        availableValuesJson: JSON.stringify(prefillStorage.availableValues),
        availableValuesMetaJson: JSON.stringify(
          prefillStorage.availableMetadata,
        ),
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
            candidateProfileVersionId: selectedProfileVersionId,
            candidateId: snapshotCandidate?.id ?? null,
            prefillMode,
            approvedFieldCount: prefillStorage.approvedFieldIds.length,
            prefilledFieldCount: Object.keys(prefillStorage.initialValues).length,
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
          prefillMode,
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
