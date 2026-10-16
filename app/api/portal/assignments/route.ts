import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  formAssignments,
  submissionReviews,
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
        applicationJob: sql<string|null>`(SELECT COALESCE(j.title,'Application documents') FROM hiring_applications a LEFT JOIN hiring_jobs j ON j.id=a.job_id AND j.owner_email=a.owner_email WHERE a.id=${formAssignments.applicationId} AND a.owner_email=${templates.ownerEmail})`,
        correctionReason: submissionReviews.reason,
        reviewStatus: sql<string>`(SELECT h.status FROM submission_reviews h JOIN submissions s ON s.id=h.submission_id WHERE s.recipient_link_id=${recipientLinks.id} ORDER BY s.submitted_at DESC LIMIT 1)`,
        templateId: formAssignments.templateId,
        templateName: templates.name,
        templateKind: templates.kind,
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
      .leftJoin(submissionReviews, eq(submissionReviews.correctionLinkId, recipientLinks.id))
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
          applicationJob: row.applicationJob,
          correctionReason: row.correctionReason,
          reviewStatus: row.reviewStatus ?? "pending",
          templateId: row.templateId,
          templateName: row.templateName,
          templateKind: row.templateKind,
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
