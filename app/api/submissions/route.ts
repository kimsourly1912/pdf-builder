import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, submissions, templates } from "@/db/schema";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const db = getDb();
    const rows = await db
      .select({
        id: submissions.id,
        templateId: templates.id,
        templateName: templates.name,
        annotationsJson: templates.annotationsJson,
        roleName: recipientLinks.roleName,
        roleColor: recipientLinks.roleColor,
        recipientName: submissions.recipientName,
        recipientEmail: submissions.recipientEmail,
        valuesJson: submissions.valuesJson,
        completedFileKey: submissions.completedFileKey,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .innerJoin(
        recipientLinks,
        eq(submissions.recipientLinkId, recipientLinks.id),
      )
      .where(eq(templates.ownerEmail, ownerEmail))
      .orderBy(desc(submissions.submittedAt))
      .limit(200);

    return Response.json({
      submissions: rows.map((row) => {
        const values = safeObject(row.valuesJson);
        const labels = annotationLabels(row.annotationsJson);
        return {
          id: row.id,
          templateId: row.templateId,
          templateName: row.templateName,
          roleName: row.roleName,
          roleColor: row.roleColor,
          recipientName: row.recipientName,
          recipientEmail: row.recipientEmail,
          submittedAt: row.submittedAt,
          values: Object.fromEntries(
            Object.entries(values).map(([id, value]) => [labels[id] ?? id, value]),
          ),
          hasCompletedPdf: Boolean(row.completedFileKey),
        };
      }),
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list submissions", error);
    return jsonError("Submissions could not be loaded.", 500);
  }
}

function annotationLabels(value: string) {
  try {
    const parsed = JSON.parse(value) as Array<{
      id?: unknown;
      fieldName?: unknown;
      label?: unknown;
      type?: unknown;
    }>;
    if (!Array.isArray(parsed)) return {};
    return Object.fromEntries(
      parsed.flatMap((annotation) => {
        if (typeof annotation.id !== "string") return [];
        const label =
          typeof annotation.fieldName === "string" && annotation.fieldName.trim()
            ? annotation.fieldName.trim()
            : typeof annotation.label === "string" && annotation.label.trim()
              ? annotation.label.trim()
              : typeof annotation.type === "string"
                ? annotation.type
                : annotation.id;
        return [[annotation.id, label]];
      }),
    );
  } catch {
    return {};
  }
}

function safeObject(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && !Array.isArray(parsed) && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}
