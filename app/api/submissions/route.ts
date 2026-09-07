import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, submissions, templates } from "@/db/schema";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import {
  annotationFieldKey,
  annotationLabel,
  isSubmissionAnswer,
} from "@/features/templates/label-binding";
import type { SubmissionAnswer } from "@/features/templates/label-binding";
import type { TemplateAnnotation } from "@/features/templates/template.types";

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
        const answers = submissionAnswers(row.valuesJson, row.annotationsJson);
        return {
          id: row.id,
          templateId: row.templateId,
          templateName: row.templateName,
          roleName: row.roleName,
          roleColor: row.roleColor,
          recipientName: row.recipientName,
          recipientEmail: row.recipientEmail,
          submittedAt: row.submittedAt,
          answers,
          values: Object.fromEntries(answers.map((answer) => [answer.label, answer.value])),
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

function parseAnnotations(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as TemplateAnnotation[] : [];
  } catch {
    return [];
  }
}

function submissionAnswers(valuesJson: string, annotationsJson: string) {
  const annotations = parseAnnotations(annotationsJson);
  try {
    const parsed = JSON.parse(valuesJson) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isSubmissionAnswer);
    if (!parsed || typeof parsed !== "object") return [];
    const values = parsed as Record<string, unknown>;
    return annotations
      .filter((annotation) => Object.hasOwn(values, annotation.id))
      .map<SubmissionAnswer>((annotation) => ({
        fieldId: annotation.id,
        key: annotationFieldKey(annotation),
        label: annotationLabel(annotation),
        type: annotation.type,
        value: values[annotation.id],
      }));
  } catch {
    return [];
  }
}
