import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  recipientLinks,
  submissions,
  templates,
  templateVersions,
} from "@/db/schema";
import {
  createSubmissionExcelWorkbook,
  submissionExcelFileName,
  XLSX_CONTENT_TYPE,
} from "@/features/templates/submission-excel";
import { normalizeTimeZone } from "@/features/templates/date-time";
import { isSubmissionAnswer } from "@/features/templates/label-binding";
import type { SubmissionAnswer } from "@/features/templates/label-binding";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import type { TemplateAnnotation } from "@/features/templates/template.types";
import { versionRole } from "@/features/templates/template-write";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const timeZone = normalizeTimeZone(
      new URL(request.url).searchParams.get("timeZone"),
    );
    const [row] = await getDb()
      .select({
        templateName: templates.name,
        versionNumber: templateVersions.versionNumber,
        annotationsJson: templateVersions.annotationsJson,
        rolesJson: templateVersions.rolesJson,
        roleId: recipientLinks.roleId,
        fallbackRoleName: recipientLinks.roleName,
        fallbackRoleColor: recipientLinks.roleColor,
        recipientName: submissions.recipientName,
        recipientEmail: submissions.recipientEmail,
        valuesJson: submissions.valuesJson,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .innerJoin(
        templateVersions,
        eq(submissions.templateVersionId, templateVersions.id),
      )
      .innerJoin(
        recipientLinks,
        eq(submissions.recipientLinkId, recipientLinks.id),
      )
      .where(and(eq(submissions.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    if (!row) return jsonError("Submission not found.", 404);
    const role = versionRole(row.rolesJson, row.roleId, {
      name: row.fallbackRoleName,
      color: row.fallbackRoleColor,
    });

    const workbook = createSubmissionExcelWorkbook({
      templateName: row.templateName,
      versionNumber: row.versionNumber,
      roleName: role.name,
      recipientName: row.recipientName,
      recipientEmail: row.recipientEmail,
      submittedAt: row.submittedAt,
      timeZone,
      answers: parseAnswers(row.valuesJson),
      annotations: parseAnnotations(row.annotationsJson),
    });
    return new Response(workbook.buffer as ArrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${submissionExcelFileName(row.templateName)}"`,
        "Content-Type": XLSX_CONTENT_TYPE,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to export submission as Excel", error);
    return jsonError("The Excel file could not be created.", 500);
  }
}

function parseAnswers(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(isSubmissionAnswer) as SubmissionAnswer[]
      : [];
  } catch {
    return [];
  }
}

function parseAnnotations(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as TemplateAnnotation[] : [];
  } catch {
    return [];
  }
}
