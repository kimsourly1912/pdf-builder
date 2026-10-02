import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  candidateProfileVersions,
  candidates,
  recipientProfiles,
  resumes,
  templates,
  templateVersions,
} from "@/db/schema";
import { buildAssignmentAutofillPreview } from "@/features/accounts/assignment-prefill";
import type { CandidateProfileOption } from "@/features/accounts/account.types";
import { normalizeCandidateProfile } from "@/features/resumes/candidate-profile";
import { buildCandidatePrefillSnapshot } from "@/features/resumes/candidate-prefill";
import { MAX_RESUME_PAGES } from "@/features/resumes/resume.types";
import type { TemplateAnnotation } from "@/features/templates/template.types";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { parseVersionRoles } from "@/features/templates/template-write";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id: userId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const templateId = searchParams.get("templateId")?.trim() ?? "";
    const roleId = searchParams.get("roleId")?.trim() ?? "";
    const profileVersionId =
      searchParams.get("candidateProfileVersionId")?.trim() ?? "";
    if (!templateId || !roleId || !profileVersionId) {
      return jsonError(
        "Choose a template, recipient role, and candidate profile.",
        400,
      );
    }

    const db = getDb();
    const [account] = await db.select({ userId: recipientProfiles.userId })
      .from(recipientProfiles)
      .where(and(
        eq(recipientProfiles.userId, userId),
        eq(recipientProfiles.createdByEmail, ownerEmail),
      ))
      .limit(1);
    if (!account) return jsonError("Recipient account not found.", 404);

    const [template] = await db
      .select({ template: templates, version: templateVersions })
      .from(templates)
      .innerJoin(
        templateVersions,
        eq(templates.currentVersionId, templateVersions.id),
      )
      .where(and(
        eq(templates.id, templateId),
        eq(templates.ownerEmail, ownerEmail),
        isNull(templates.archivedAt),
      ))
      .limit(1);
    if (!template) return jsonError("Template not found.", 404);
    const role = parseVersionRoles(template.version.rolesJson)
      .find((item) => item.id === roleId);
    if (!role) return jsonError("Recipient role not found.", 404);

    const [selected] = await db
      .select({
        profile: candidateProfileVersions,
        candidate: candidates,
        fileName: resumes.fileName,
        appliedPosition: resumes.appliedPosition,
        receivedDate: resumes.receivedDate,
      })
      .from(candidateProfileVersions)
      .innerJoin(
        candidates,
        and(
          eq(candidateProfileVersions.candidateId, candidates.id),
          eq(candidateProfileVersions.ownerEmail, candidates.ownerEmail),
        ),
      )
      .leftJoin(
        resumes,
        and(
          eq(candidateProfileVersions.resumeId, resumes.id),
          eq(resumes.ownerEmail, ownerEmail),
        ),
      )
      .where(and(
        eq(candidateProfileVersions.id, profileVersionId),
        eq(candidateProfileVersions.ownerEmail, ownerEmail),
        eq(candidates.ownerEmail, ownerEmail),
      ))
      .limit(1);
    if (!selected) return jsonError("Candidate profile not found.", 404);

    const profile = parseProfile(selected.profile.profileJson);
    if (!profile) {
      return jsonError("The selected candidate profile is invalid.", 422);
    }
    const annotations = parseArray<TemplateAnnotation>(
      template.version.annotationsJson,
    );
    const verificationStatus = selected.profile.verificationStatus === "verified"
      ? "verified" as const
      : "extracted" as const;
    const snapshot = buildCandidatePrefillSnapshot({
      candidate: selected.candidate,
      annotations,
      recipientRoleId: role.id,
      profileVersion: {
        id: selected.profile.id,
        profile,
        verificationStatus,
      },
    });
    const profileOption: CandidateProfileOption = {
      id: selected.profile.id,
      candidateId: selected.candidate.id,
      candidateName: selected.candidate.fullName,
      email: selected.candidate.email,
      phone: selected.candidate.phone,
      currentTitle: selected.candidate.currentTitle,
      versionNumber: selected.profile.versionNumber,
      verificationStatus,
      fileName: selected.fileName ?? "",
      appliedPosition: selected.appliedPosition ?? "",
      receivedDate: selected.receivedDate ?? null,
      createdAt: selected.profile.createdAt,
      linkedToAccount: selected.candidate.userId === userId,
    };
    return Response.json(
      buildAssignmentAutofillPreview({
        annotations,
        recipientRoleId: role.id,
        snapshot,
        profile: profileOption,
        candidateProfile: profile,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to preview assignment autofill", error);
    return jsonError("The autofill preview could not be generated.", 500);
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
    return normalizeCandidateProfile(
      JSON.parse(value) as unknown,
      MAX_RESUME_PAGES,
    );
  } catch {
    return null;
  }
}
