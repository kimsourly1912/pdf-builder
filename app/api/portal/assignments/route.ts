import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  formAssignments,
  recipientLinks,
  templates,
  templateVersions,
} from "@/db/schema";
import { requireRecipientAccount } from "@/features/accounts/account.server";
import { toUtcIsoString } from "@/features/templates/date-time";
import { recipientLinkAvailability } from "@/features/templates/recipient-link-lifecycle";
import { assignedFillIdentifier } from "@/features/templates/submission-artifact";
import { isResponse, jsonError } from "@/features/templates/template.server";

export async function GET(request: Request) {
  try {
    const account = await requireRecipientAccount(request.headers);
    if (account.profile.mustChangePassword) {
      return jsonError("Change your temporary password before opening forms.", 428);
    }
    const rows = await getDb()
      .select({
        id: formAssignments.id,
        templateId: formAssignments.templateId,
        templateName: templates.name,
        description: templates.description,
        versionNumber: templateVersions.versionNumber,
        roleId: formAssignments.roleId,
        roleName: formAssignments.roleName,
        roleColor: formAssignments.roleColor,
        assignmentStatus: formAssignments.status,
        assignedAt: formAssignments.assignedAt,
        completedAt: formAssignments.completedAt,
        linkStatus: recipientLinks.status,
        expiresAt: recipientLinks.expiresAt,
        maxSubmissions: recipientLinks.maxSubmissions,
        submissionCount: recipientLinks.submissionCount,
        revokedAt: recipientLinks.revokedAt,
        linkCompletedAt: recipientLinks.completedAt,
      })
      .from(formAssignments)
      .innerJoin(templates, eq(formAssignments.templateId, templates.id))
      .innerJoin(
        templateVersions,
        eq(formAssignments.templateVersionId, templateVersions.id),
      )
      .innerJoin(
        recipientLinks,
        eq(formAssignments.recipientLinkId, recipientLinks.id),
      )
      .where(eq(formAssignments.userId, account.session.user.id))
      .orderBy(desc(formAssignments.assignedAt));

    return Response.json({
      assignments: rows.map((row) => {
        const availability = recipientLinkAvailability({
          status: row.linkStatus,
          expiresAt: row.expiresAt,
          maxSubmissions: row.maxSubmissions,
          submissionCount: row.submissionCount,
        });
        const status =
          row.assignmentStatus === "assigned"
            ? availability.state
            : row.assignmentStatus;
        return {
          id: row.id,
          templateId: row.templateId,
          templateName: row.templateName,
          description: row.description,
          versionNumber: row.versionNumber,
          roleId: row.roleId,
          roleName: row.roleName,
          roleColor: row.roleColor,
          status,
          assignedAt: toUtcIsoString(row.assignedAt) ?? row.assignedAt,
          completedAt: row.completedAt
            ? toUtcIsoString(row.completedAt) ?? row.completedAt
            : row.linkCompletedAt
              ? toUtcIsoString(row.linkCompletedAt) ?? row.linkCompletedAt
              : null,
          url: availability.available
            ? `/fill/${assignedFillIdentifier(row.id)}`
            : null,
        };
      }),
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list assigned forms", error);
    return jsonError("Assigned forms could not be loaded.", 500);
  }
}
