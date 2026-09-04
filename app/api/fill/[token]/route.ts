import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, submissions, templates } from "@/db/schema";
import {
  getFilesBucket,
  hashRecipientToken,
  jsonError,
} from "@/features/templates/template.server";
import type {
  TemplateAnnotation,
  TemplateFillPayload,
  TemplatePageEntry,
} from "@/features/templates/template.types";

const MAX_COMPLETED_PDF_SIZE = 35 * 1024 * 1024;
const FIELD_TYPES = new Set([
  "input",
  "dropdown",
  "checkbox",
  "radio",
  "checkbox-group",
  "radio-group",
  "date",
  "initials",
  "image-placeholder",
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const fillContext = await findFillContext(token);
    if (!fillContext) return jsonError("This fill link is invalid or expired.", 404);

    const annotations = parseArray<TemplateAnnotation>(
      fillContext.template.annotationsJson,
    ).filter(
      (annotation) =>
        !FIELD_TYPES.has(annotation.type) ||
        annotation.recipientRoleId === fillContext.link.roleId,
    );
    const pageOrder = parseArray<TemplatePageEntry>(
      fillContext.template.pageOrderJson,
    );
    const payload: TemplateFillPayload = {
      template: {
        id: fillContext.template.id,
        name: fillContext.template.name,
        description: fillContext.template.description,
        fileName: fillContext.template.fileName,
        annotations,
        pageOrder,
      },
      recipient: {
        id: fillContext.link.roleId,
        name: fillContext.link.roleName,
        color: fillContext.link.roleColor,
      },
    };
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load fill link", error);
    return jsonError("This document could not be loaded.", 500);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  let completedFileKey: string | null = null;
  try {
    const { token } = await context.params;
    const fillContext = await findFillContext(token);
    if (!fillContext) return jsonError("This fill link is invalid or expired.", 404);

    const formData = await request.formData();
    const recipientName = String(formData.get("recipientName") ?? "")
      .trim()
      .slice(0, 120);
    const recipientEmail = String(formData.get("recipientEmail") ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 254);
    const values = parseValues(formData.get("values"));
    const completedPdf = formData.get("completedPdf");
    if (!recipientName) return jsonError("Your name is required.", 400);
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipientEmail)) {
      return jsonError("Enter a valid email address.", 400);
    }
    if (!values) return jsonError("Submitted field values are invalid.", 400);

    const assignedFields = parseArray<TemplateAnnotation>(
      fillContext.template.annotationsJson,
    ).filter(
      (annotation) =>
        FIELD_TYPES.has(annotation.type) &&
        annotation.recipientRoleId === fillContext.link.roleId,
    );
    const allowedIds = new Set(assignedFields.map((field) => field.id));
    if (Object.keys(values).some((id) => !allowedIds.has(id))) {
      return jsonError("The submission contains unknown fields.", 400);
    }

    const submissionId = crypto.randomUUID();
    if (completedPdf instanceof File && completedPdf.size > 0) {
      if (
        completedPdf.type !== "application/pdf" ||
        completedPdf.size > MAX_COMPLETED_PDF_SIZE
      ) {
        return jsonError("The completed PDF is invalid or too large.", 400);
      }
      completedFileKey = `submissions/${fillContext.template.id}/${submissionId}/completed.pdf`;
      await getFilesBucket().put(
        completedFileKey,
        await completedPdf.arrayBuffer(),
        { httpMetadata: { contentType: "application/pdf" } },
      );
    }

    const db = getDb();
    await db.insert(submissions).values({
      id: submissionId,
      templateId: fillContext.template.id,
      recipientLinkId: fillContext.link.id,
      recipientName,
      recipientEmail,
      valuesJson: JSON.stringify(values),
      completedFileKey,
    });
    return Response.json(
      { submission: { id: submissionId, status: "completed" } },
      { status: 201 },
    );
  } catch (error) {
    if (completedFileKey) {
      await getFilesBucket().delete(completedFileKey).catch(() => undefined);
    }
    console.error("Failed to submit fill link", error);
    return jsonError("Your submission could not be saved.", 500);
  }
}

async function findFillContext(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/u.test(token)) return null;
  const tokenHash = await hashRecipientToken(token);
  const db = getDb();
  const [row] = await db
    .select({ link: recipientLinks, template: templates })
    .from(recipientLinks)
    .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
    .where(
      and(
        eq(recipientLinks.tokenHash, tokenHash),
        eq(recipientLinks.status, "active"),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.link.expiresAt && new Date(row.link.expiresAt) <= new Date()) {
    return null;
  }
  return row;
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseValues(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length > 500_000) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
