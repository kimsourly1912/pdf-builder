import { formResponse } from "@/features/forms/form.server";
import { findFillContext } from "@/features/templates/fill-context.server";
import { formDraftPayload, submitForm } from "@/features/forms/submission.server";
import { and, eq } from "drizzle-orm";

import { getDatabaseBinding, getDb } from "@/db";
import {
  submissions,
} from "@/db/schema";
import { authorizeAssignedRecipient } from "@/features/accounts/account.server";
import { createAuditEvent } from "@/features/audit/audit.server";
import { isCandidatePrefillKey } from "@/features/resumes/candidate-prefill";
import { resumeValueForField } from "@/features/templates/recipient-prefill";
import { compensateStorageWrites } from "@/features/storage/storage-cleanup.server";
import { buildSubmissionAnswers } from "@/features/templates/label-binding";
import {
  buildAuthoritativeCompletedPdf,
} from "@/features/templates/completed-pdf.server";
import {
  COMPLETED_PDF_GENERATOR,
  sha256Hex,
} from "@/features/templates/submission-artifact";
import { toUtcIsoString } from "@/features/templates/date-time";
import { sanitizeImage } from "@/features/templates/file-validation";
import {
  recipientLinkAvailability,
  validIdempotencyKey,
} from "@/features/templates/recipient-link-lifecycle";
import {
  getFilesBucket,
  isResponse,
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
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const fillContext = await findFillContext(token);
    if (!fillContext) return jsonError("This fill link is invalid.", 404);
    const assignedAccount = await authorizeAssignedRecipient(
      request.headers,
      fillContext.link.assignedUserId,
    );

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
    const formExtras = fillContext.version.formDefinitionJson ? await formDraftPayload(fillContext) : {};
    const payload: TemplateFillPayload = {
      ...formExtras,
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
      identity: assignedAccount
        ? {
            name:
              assignedAccount.session.user.name ||
              assignedAccount.session.user.email,
            email: assignedAccount.session.user.email,
            accountType: assignedAccount.profile.accountType,
          }
        : undefined,
      initialValues: assignedAccount
        ? parseRecord(fillContext.assignment?.initialValuesJson)
        : undefined,
      resumePrefill:
        assignedAccount
        && fillContext.assignment
        && fillContext.assignment.prefillMode !== "none"
          ? buildRecipientResumePrefill(
              fillContext.assignment.availableValuesJson,
              fillContext.assignment.availableValuesMetaJson,
            )
          : undefined,
    };
    if (payload.formDefinition?.presentation) {
      payload.template.name = payload.formDefinition.presentation.title;
      payload.template.description = payload.formDefinition.presentation.description;
    }
    return Response.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (isResponse(error)) return error;
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
    const assignedAccount = await authorizeAssignedRecipient(
      request.headers,
      fillContext.link.assignedUserId,
    );

    if (fillContext.version.formDefinitionJson) return await formResponse(() => submitForm(request, fillContext));

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
    const recipientName = assignedAccount
      ? (assignedAccount.session.user.name || assignedAccount.session.user.email)
          .trim()
          .slice(0, 120)
      : String(formData.get("recipientName") ?? "").trim().slice(0, 120);
    const recipientEmail = assignedAccount
      ? assignedAccount.session.user.email.trim().toLowerCase().slice(0, 254)
      : String(formData.get("recipientEmail") ?? "")
          .trim()
          .toLowerCase()
          .slice(0, 254);
    const values = parseValues(formData.get("values"));
    const resumeAppliedFieldIds = parseFieldIdList(
      formData.get("resumeAppliedFieldIds"),
    );
    if (!recipientName) return jsonError("Your name is required.", 400);
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipientEmail)) {
      return jsonError("Enter a valid email address.", 400);
    }
    if (!values) return jsonError("Submitted field values are invalid.", 400);
    if (!resumeAppliedFieldIds) {
      return jsonError("Resume field history is invalid.", 400);
    }

    const assignedFields = parseArray<TemplateAnnotation>(
      fillContext.version.annotationsJson,
    ).filter(
      (annotation) =>
        isRecipientFieldType(annotation.type) &&
        annotation.recipientRoleId === fillContext.link.roleId,
    );
    const assignedFieldIds = new Set(assignedFields.map((field) => field.id));
    const resumeSourceFieldIds = new Set([
      ...Object.keys(
        parseRecord(fillContext.assignment?.initialValuesMetaJson),
      ),
      ...Object.keys(
        parseRecord(fillContext.assignment?.availableValuesMetaJson),
      ),
    ]);
    const approvedProfileValues = Object.entries(
      parseRecord(fillContext.assignment?.availableValuesJson),
    ).filter(([key, value]) =>
      isCandidatePrefillKey(key)
      && typeof value === "string"
      && resumeSourceFieldIds.has(key)
    ) as Array<[string, string]>;
    if (
      resumeAppliedFieldIds.some(
        (fieldId) => {
          if (!assignedFieldIds.has(fieldId)) return true;
          if (resumeSourceFieldIds.has(fieldId)) return false;
          const field = assignedFields.find((item) => item.id === fieldId);
          return !field || !approvedProfileValues.some(([, value]) =>
            resumeValueForField(field, value, fillContext.link.roleId) === values[fieldId]
          );
        },
      )
    ) {
      return jsonError(
        "Resume field history does not match this assignment.",
        422,
      );
    }

    const imageFiles = collectImageFiles(formData);
    if (!imageFiles.ok) return jsonError(imageFiles.message, 400);
    const validation = validateSubmissionValues({
      fields: assignedFields,
      values,
      imageFieldIds: new Set(imageFiles.files.keys()),
    });
    if (!validation.ok) return jsonError(validation.message, 422);

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
    const sourcePdf = await getFilesBucket().get(fillContext.version.fileKey);
    if (!sourcePdf) {
      return jsonError("The source PDF is unavailable.", 409);
    }
    const allAnnotations = parseArray<TemplateAnnotation>(
      fillContext.version.annotationsJson,
    );
    const renderAnnotations = allAnnotations.filter(
      (annotation) =>
        !isRecipientFieldType(annotation.type) ||
        annotation.recipientRoleId === fillContext.link.roleId,
    );
    const completedPdfBytes = await buildAuthoritativeCompletedPdf({
      sourcePdfBytes: new Uint8Array(
        await new Response(sourcePdf.body).arrayBuffer(),
      ) as Uint8Array<ArrayBuffer>,
      pageOrder: parseArray<TemplatePageEntry>(
        fillContext.version.pageOrderJson,
      ),
      annotations: renderAnnotations,
      values: validation.values,
      images: new Map(
        preparedImages.map(({ fieldId, image }) => [
          fieldId,
          { bytes: image.bytes, contentType: image.contentType },
        ]),
      ),
      origin: new URL(request.url).origin,
    });
    if (completedPdfBytes.length > MAX_COMPLETED_PDF_SIZE) {
      return jsonError("The completed PDF is too large.", 422);
    }
    const completedFileChecksum = await sha256Hex(completedPdfBytes);
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
      customMetadata: {
        checksum: completedFileChecksum,
        generator: COMPLETED_PDF_GENERATOR,
        templateVersionId: fillContext.version.id,
      },
    });

    const now = new Date().toISOString();
    const auditEvent = createAuditEvent({
      request,
      ownerEmail: fillContext.template.ownerEmail,
      actorType: "recipient",
      actorId: assignedAccount?.session.user.id ?? fillContext.link.id,
      action: "submission.completed",
      targetType: "submission",
      targetId: submissionId,
      metadata: {
        assigned: Boolean(assignedAccount),
        roleId: fillContext.link.roleId,
        templateId: fillContext.template.id,
        versionNumber: fillContext.version.versionNumber,
        resumePrefillMode: fillContext.assignment?.prefillMode ?? "none",
        resumeAppliedFieldIds,
      },
      createdAt: now,
    });
    const database = getDatabaseBinding();
    const results = await database.batch([
      database
        .prepare(
          `INSERT OR IGNORE INTO submissions (
            id, template_id, recipient_link_id, template_version_id,
            idempotency_key, recipient_name, recipient_email, values_json,
            completed_file_key, completed_file_checksum, artifact_generator,
            submitted_at
          )
          SELECT ?, template_id, id, template_version_id, ?, ?, ?, ?, ?, ?, ?, ?
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
          completedFileChecksum,
          COMPLETED_PDF_GENERATOR,
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
      database
        .prepare(
          `UPDATE form_assignments
          SET status = 'completed', completed_at = ?, updated_at = ?
          WHERE recipient_link_id = ?
            AND EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
        )
        .bind(now, now, fillContext.link.id, submissionId),
      database
        .prepare(
          `INSERT INTO audit_events (
            id, owner_email, actor_type, actor_id, action, target_type,
            target_id, request_id, metadata_json, created_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
        )
        .bind(
          auditEvent.id,
          auditEvent.ownerEmail,
          auditEvent.actorType,
          auditEvent.actorId,
          auditEvent.action,
          auditEvent.targetType,
          auditEvent.targetId,
          auditEvent.requestId,
          auditEvent.metadataJson,
          auditEvent.createdAt,
          submissionId,
        ),
    ]);

    const inserted = Number(results[0]?.meta?.changes ?? 0) > 0;
    if (!inserted) {
      await compensateStorageWrites(
        completedFileKey
          ? [completedFileKey, ...uploadedImageKeys]
          : uploadedImageKeys,
        "submission_rolled_back",
      );
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
    await compensateStorageWrites(
      completedFileKey
        ? [completedFileKey, ...uploadedImageKeys]
        : uploadedImageKeys,
      "submission_rolled_back",
    );
    if (isResponse(error)) return error;
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


function parseRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && !Array.isArray(parsed) && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function buildRecipientResumePrefill(
  valuesJson: string,
  metadataJson: string,
): NonNullable<TemplateFillPayload["resumePrefill"]> | undefined {
  const values = parseRecord(valuesJson);
  const rawMetadata = parseRecord(metadataJson);
  const metadata: NonNullable<
    TemplateFillPayload["resumePrefill"]
  >["metadata"] = {};
  const profileValues: NonNullable<TemplateFillPayload["resumePrefill"]>["profileValues"] = {};

  for (const fieldId of Object.keys(values)) {
    const item = rawMetadata[fieldId];
    if (!item || Array.isArray(item) || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (!isCandidatePrefillKey(record.prefillKey)) continue;
    if (fieldId.startsWith("candidate.")) {
      if (fieldId !== record.prefillKey || typeof values[fieldId] !== "string") continue;
      profileValues[fieldId] = {
        value: values[fieldId] as string,
        confidence: typeof record.confidence === "number" ? record.confidence : null,
        sourcePage: typeof record.sourcePage === "number" ? record.sourcePage : null,
      };
      delete values[fieldId];
      continue;
    }
    metadata[fieldId] = {
      prefillKey: record.prefillKey,
      confidence:
        typeof record.confidence === "number"
        && Number.isFinite(record.confidence)
          ? Math.min(1, Math.max(0, record.confidence))
          : null,
      sourcePage:
        typeof record.sourcePage === "number"
        && Number.isInteger(record.sourcePage)
        && record.sourcePage > 0
          ? record.sourcePage
          : null,
      verificationStatus:
        record.verificationStatus === "verified"
          ? "verified"
          : "extracted",
    };
  }

  return Object.keys(values).length + Object.keys(profileValues).length > 0
    ? { values, metadata, profileValues }
    : undefined;
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

function parseFieldIdList(value: FormDataEntryValue | null): string[] | null {
  if (value === null) return [];
  if (typeof value !== "string" || value.length > 25_000) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length > 200) return null;
    const fieldIds = parsed.filter(
      (fieldId): fieldId is string =>
        typeof fieldId === "string"
        && /^[A-Za-z0-9_-]{1,120}$/u.test(fieldId),
    );
    if (fieldIds.length !== parsed.length) return null;
    return Array.from(new Set(fieldIds));
  } catch {
    return null;
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
