import { and, eq } from "drizzle-orm";

import { getDatabaseBinding, getDb } from "@/db";
import {
  recipientLinks,
  submissions,
  templates,
  templateVersions,
} from "@/db/schema";
import { buildSubmissionAnswers } from "@/features/templates/label-binding";
import { toUtcIsoString } from "@/features/templates/date-time";
import {
  sanitizeImage,
  inspectPdf,
} from "@/features/templates/file-validation";
import {
  recipientLinkAvailability,
  validIdempotencyKey,
} from "@/features/templates/recipient-link-lifecycle";
import {
  getFilesBucket,
  hashRecipientToken,
  jsonError,
} from "@/features/templates/template.server";
import { isRecipientFieldType } from "@/features/templates/template-fields";
import { validateSubmissionValues } from "@/features/templates/submission-validation";
import type {
  TemplateAnnotation,
  TemplateFillPayload,
  TemplatePageEntry,
} from "@/features/templates/template.types";

const MAX_COMPLETED_PDF_SIZE = 35 * 1024 * 1024;
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGE_FIELDS = 20;

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const fillContext = await findFillContext(token);
    if (!fillContext) return jsonError("This fill link is invalid.", 404);

    const availability = recipientLinkAvailability(fillContext.link);
    if (!availability.available) {
      return jsonError(availability.message, availability.httpStatus);
    }

    const annotations = parseArray<TemplateAnnotation>(
      fillContext.version.annotationsJson,
    ).filter(
      (annotation) =>
        !isRecipientFieldType(annotation.type) ||
        annotation.recipientRoleId === fillContext.link.roleId,
    );
    const pageOrder = parseArray<TemplatePageEntry>(
      fillContext.version.pageOrderJson,
    );
    const payload: TemplateFillPayload = {
      template: {
        id: fillContext.template.id,
        versionId: fillContext.version.id,
        versionNumber: fillContext.version.versionNumber,
        name: fillContext.template.name,
        description: fillContext.template.description,
        fileName: fillContext.version.fileName,
        annotations,
        pageOrder,
      },
      recipient: {
        id: fillContext.link.roleId,
        name: fillContext.link.roleName,
        color: fillContext.link.roleColor,
      },
      link: {
        expiresAt: toUtcIsoString(fillContext.link.expiresAt),
        maxSubmissions: fillContext.link.maxSubmissions,
        submissionCount: fillContext.link.submissionCount,
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
  const uploadedImageKeys: string[] = [];
  try {
    const { token } = await context.params;
    const fillContext = await findFillContext(token);
    if (!fillContext) return jsonError("This fill link is invalid.", 404);

    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!validIdempotencyKey(idempotencyKey)) {
      return jsonError("A valid idempotency key is required.", 400);
    }

    const existingSubmission = await findIdempotentSubmission(
      fillContext.link.id,
      idempotencyKey,
    );
    if (existingSubmission) {
      return Response.json({
        submission: {
          id: existingSubmission.id,
          status: "completed",
          reused: true,
        },
      });
    }

    const availability = recipientLinkAvailability(fillContext.link);
    if (!availability.available) {
      return jsonError(availability.message, availability.httpStatus);
    }

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
      fillContext.version.annotationsJson,
    ).filter(
      (annotation) =>
        isRecipientFieldType(annotation.type) &&
        annotation.recipientRoleId === fillContext.link.roleId,
    );
    const imageFiles = collectImageFiles(formData);
    if (!imageFiles.ok) return jsonError(imageFiles.message, 400);
    const validation = validateSubmissionValues({
      fields: assignedFields,
      values,
      imageFieldIds: new Set(imageFiles.files.keys()),
    });
    if (!validation.ok) return jsonError(validation.message, 422);

    if (!(completedPdf instanceof File) || completedPdf.size === 0) {
      return jsonError("A completed PDF is required.", 400);
    }
    if (
      completedPdf.type !== "application/pdf" ||
      completedPdf.size > MAX_COMPLETED_PDF_SIZE
    ) {
      return jsonError("The completed PDF is invalid or too large.", 400);
    }
    const completedPdfBytes = new Uint8Array(
      await completedPdf.arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    if (!(await inspectPdf(completedPdfBytes))) {
      return jsonError("The completed PDF is invalid.", 400);
    }

    const submissionId = crypto.randomUUID();
    const storedValues = { ...validation.values };
    const preparedImages: Array<{
      fieldId: string;
      image: NonNullable<ReturnType<typeof sanitizeImage>>;
    }> = [];
    for (const [fieldId, file] of imageFiles.files) {
      const source = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
      const image = sanitizeImage(source, file.type);
      if (!image) {
        return jsonError(
          "Images must be valid PNG or JPEG files up to 8 MB and 4096 pixels per side.",
          422,
        );
      }
      preparedImages.push({ fieldId, image });
    }
    for (const { fieldId, image } of preparedImages) {
      const storageKey =
        `submissions/${fillContext.template.id}/${submissionId}/images/${fieldId}.${image.extension}`;
      await getFilesBucket().put(storageKey, image.bytes.buffer, {
        httpMetadata: { contentType: image.contentType },
      });
      uploadedImageKeys.push(storageKey);
      storedValues[fieldId] = {
        kind: "submission-image",
        storageKey,
        contentType: image.contentType,
        width: image.width,
        height: image.height,
        size: image.bytes.length,
      };
    }
    completedFileKey =
      `submissions/${fillContext.template.id}/${submissionId}/completed.pdf`;
    await getFilesBucket().put(completedFileKey, completedPdfBytes.buffer, {
      httpMetadata: { contentType: "application/pdf" },
    });

    const now = new Date().toISOString();
    const database = getDatabaseBinding();
    const results = await database.batch([
      database
        .prepare(
          `INSERT OR IGNORE INTO submissions (
            id, template_id, recipient_link_id, template_version_id,
            idempotency_key, recipient_name, recipient_email, values_json,
            completed_file_key, submitted_at
          )
          SELECT ?, template_id, id, template_version_id, ?, ?, ?, ?, ?, ?
          FROM recipient_links
          WHERE id = ?
            AND token_hash = ?
            AND template_version_id = ?
            AND status = 'active'
            AND submission_count < max_submissions
            AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .bind(
          submissionId,
          idempotencyKey,
          recipientName,
          recipientEmail,
          JSON.stringify(buildSubmissionAnswers(assignedFields, storedValues)),
          completedFileKey,
          now,
          fillContext.link.id,
          fillContext.link.tokenHash,
          fillContext.version.id,
          now,
        ),
      database
        .prepare(
          `UPDATE recipient_links
          SET submission_count = submission_count + 1,
              status = CASE
                WHEN submission_count + 1 >= max_submissions
                THEN 'completed'
                ELSE 'active'
              END,
              completed_at = CASE
                WHEN submission_count + 1 >= max_submissions
                THEN ?
                ELSE completed_at
              END,
              updated_at = ?
          WHERE id = ?
            AND EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
        )
        .bind(now, now, fillContext.link.id, submissionId),
    ]);

    const inserted = Number(results[0]?.meta?.changes ?? 0) > 0;
    if (!inserted) {
      await deleteUploadedFiles(completedFileKey, uploadedImageKeys);
      completedFileKey = null;
      uploadedImageKeys.length = 0;
      const racedSubmission = await findIdempotentSubmission(
        fillContext.link.id,
        idempotencyKey,
      );
      if (racedSubmission) {
        return Response.json({
          submission: {
            id: racedSubmission.id,
            status: "completed",
            reused: true,
          },
        });
      }
      return jsonError(
        "This fill link has already reached its submission limit.",
        409,
      );
    }

    return Response.json(
      {
        submission: {
          id: submissionId,
          status: "completed",
          reused: false,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    await deleteUploadedFiles(completedFileKey, uploadedImageKeys);
    console.error("Failed to submit fill link", error);
    return jsonError("Your submission could not be saved.", 500);
  }
}

function collectImageFiles(
  formData: FormData,
): { ok: true; files: Map<string, File> } | { ok: false; message: string } {
  const files = new Map<string, File>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("image:")) continue;
    const fieldId = key.slice("image:".length);
    if (
      !/^[A-Za-z0-9_-]{1,120}$/u.test(fieldId) ||
      !(value instanceof File) ||
      value.size === 0 ||
      value.size > MAX_IMAGE_SIZE ||
      (value.type !== "image/png" && value.type !== "image/jpeg") ||
      files.has(fieldId) ||
      files.size >= MAX_IMAGE_FIELDS
    ) {
      return { ok: false, message: "The submission contains an invalid image upload." };
    }
    files.set(fieldId, value);
  }
  return { ok: true, files };
}

async function deleteUploadedFiles(
  completedFileKey: string | null,
  imageKeys: string[],
) {
  const keys = completedFileKey ? [completedFileKey, ...imageKeys] : imageKeys;
  await Promise.all(
    keys.map((key) => getFilesBucket().delete(key).catch(() => undefined)),
  );
}

async function findFillContext(token: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/u.test(token)) return null;
  const tokenHash = await hashRecipientToken(token);
  const [row] = await getDb()
    .select({
      link: recipientLinks,
      template: templates,
      version: templateVersions,
    })
    .from(recipientLinks)
    .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
    .innerJoin(
      templateVersions,
      eq(recipientLinks.templateVersionId, templateVersions.id),
    )
    .where(eq(recipientLinks.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

async function findIdempotentSubmission(
  recipientLinkId: string,
  idempotencyKey: string,
) {
  const [submission] = await getDb()
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.recipientLinkId, recipientLinkId),
        eq(submissions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return submission ?? null;
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
