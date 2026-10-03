import "server-only";
import { and, eq, isNull, lt, or, asc } from "drizzle-orm";
import { getDatabaseBinding, getDb } from "@/db";
import {
  formResponseDrafts,
  formSubmissionArtifacts,
  submissions,
  templates,
  templateVersions,
} from "@/db/schema";
import { authorizeAssignedRecipient } from "@/features/accounts/account.server";
import { findFillContext } from "@/features/templates/fill-context.server";
import type { FillContext } from "@/features/templates/fill-context.server";
import {
  getFilesBucket,
  jsonError,
} from "@/features/templates/template.server";
import {
  recipientLinkAvailability,
  validIdempotencyKey,
} from "@/features/templates/recipient-link-lifecycle";
import { sanitizeImage } from "@/features/templates/file-validation";
import type { StoredSubmissionImage } from "@/features/templates/file-validation";
import {
  compensateStorageWrites,
  createStorageCleanupRows,
} from "@/features/storage/storage-cleanup.server";
import { buildAuthoritativeCompletedPdf } from "@/features/templates/completed-pdf.server";
import { sha256Hex } from "@/features/templates/submission-artifact";
import { answerSchema, formAnswers, outputPlacements } from "./form";
import { parseDefinition } from "./form.server";

function record(text: string | null) {
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}
function storedImage(value: unknown): value is StoredSubmissionImage {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as StoredSubmissionImage).kind === "submission-image" &&
      typeof (value as StoredSubmissionImage).storageKey === "string",
  );
}
export async function formDraftPayload(context: FillContext) {
  const [draft] = await getDb()
    .select()
    .from(formResponseDrafts)
    .where(eq(formResponseDrafts.recipientLinkId, context.link.id))
    .limit(1);
  return {
    formDefinition: parseDefinition(context.version.formDefinitionJson),
    formDraftRevision: draft?.revision ?? "",
    formDraftValues: Object.fromEntries(
      Object.entries(record(draft?.valuesJson ?? null)).map(([id, value]) => [
        id,
        storedImage(value) ? `stored:${id}` : value,
      ]),
    ),
  };
}
export async function assignedForm(request: Request, token: string) {
  const context = await findFillContext(token);
  if (!context?.version.formDefinitionJson || !context.link.assignedUserId)
    throw jsonError("Assigned form not found.", 404);
  const account = await authorizeAssignedRecipient(
    request.headers,
    context.link.assignedUserId,
  );
  const available = recipientLinkAvailability(context.link);
  if (!available.available)
    throw jsonError(available.message, available.httpStatus);
  return { context, account: account! };
}
async function prepareAnswers(
  request: Request,
  context: FillContext,
  draft: boolean,
) {
  const definition = parseDefinition(context.version.formDefinitionJson);
  const data = await request.formData();
  const raw = data.get("values");
  if (typeof raw !== "string" || raw.length > 500000)
    throw jsonError("Submitted answers are invalid or too large.", 422);
  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    throw jsonError("Submitted answers are invalid.", 422);
  }
  const result = answerSchema(definition, draft).safeParse(values);
  if (!result.success)
    throw jsonError(
      result.error.issues[0]?.message ?? "Check the answers.",
      422,
    );
  const prepared = result.data as Record<string, unknown>;
  const initial = record(context.assignment?.initialValuesJson ?? null);
  for (const field of definition.fields)
    if (
      !field.editable &&
      field.autofill &&
      initial[field.id] !== undefined &&
      initial[field.id] !== "" &&
      (field.type === "number"
        ? String(prepared[field.id]) !== String(initial[field.id])
        : prepared[field.id] !== initial[field.id])
    )
      throw jsonError(
        `${field.label} is prefilled and cannot be changed.`,
        422,
      );
  const [previous] = await getDb()
    .select()
    .from(formResponseDrafts)
    .where(eq(formResponseDrafts.recipientLinkId, context.link.id))
    .limit(1);
  const previousValues = record(previous?.valuesJson ?? null),
    uploaded: string[] = [];
  try {
    const mediaFields = definition.fields.filter(
      (f) => f.type === "photo" || f.type === "signature",
    );
    const files = new Map<string, File>();
    for (const [key, value] of data.entries()) {
      if (!key.startsWith("image:")) continue;
      const id = key.slice(6);
      if (
        !(value instanceof File) ||
        !mediaFields.some((f) => f.id === id) ||
        files.has(id) ||
        files.size >= 20 ||
        value.size > 8 * 1024 * 1024
      )
        throw jsonError("The form contains an invalid image upload.", 422);
      files.set(id, value);
    }
    for (const field of mediaFields) {
      const file = files.get(field.id);
      if (file) {
        const image = sanitizeImage(
          new Uint8Array(await file.arrayBuffer()),
          file.type,
        );
        if (!image)
          throw jsonError(
            "Images must be valid PNG or JPEG files up to 8 MB and 4096 pixels per side.",
            422,
          );
        const key = `forms/${context.template.id}/responses/${context.link.id}/${crypto.randomUUID()}/${field.id}.${image.extension}`;
        await getFilesBucket().put(key, image.bytes.buffer, {
          httpMetadata: { contentType: image.contentType },
        });
        uploaded.push(key);
        prepared[field.id] = {
          kind: "submission-image",
          storageKey: key,
          contentType: image.contentType,
          width: image.width,
          height: image.height,
          size: image.bytes.length,
        } satisfies StoredSubmissionImage;
      } else if (prepared[field.id]) {
        if (!storedImage(previousValues[field.id]))
          throw jsonError(`Upload ${field.label} before saving.`, 422);
        prepared[field.id] = previousValues[field.id];
      }
    }
    const retained = new Set(
      Object.values(prepared)
        .filter(storedImage)
        .map((image) => image.storageKey),
    );
    const discarded = Object.values(previousValues)
      .filter(storedImage)
      .map((image) => image.storageKey)
      .filter((key) => !retained.has(key));
    return {
      prepared,
      definition,
      uploaded,
      discarded,
      revision: String(data.get("revision") ?? ""),
    };
  } catch (error) {
    await compensateStorageWrites(uploaded, "submission_rolled_back");
    throw error;
  }
}
function responseGuard(context: FillContext, revision: string) {
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO form_response_guards(id,recipient_link_id,revision,assigned_user_id,version_id) VALUES(?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      context.link.id,
      revision,
      context.link.assignedUserId,
      context.version.id,
    );
}
function cleanupStatements(keys: string[], now: string) {
  const db = getDatabaseBinding();
  return createStorageCleanupRows(keys, "submission_rolled_back", now).map(
    (job) =>
      db
        .prepare(
          "INSERT INTO storage_cleanup_jobs(id,object_key,reason,attempt_count,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(job.id, job.objectKey, job.reason, 0, now, now),
  );
}
export async function saveResponseDraft(request: Request, token: string) {
  const { context } = await assignedForm(request, token),
    answers = await prepareAnswers(request, context, true);
  const db = getDatabaseBinding(),
    revision = crypto.randomUUID(),
    now = new Date().toISOString();
  try {
    await db.batch([
      responseGuard(context, answers.revision),
      db
        .prepare(
          "INSERT INTO form_response_drafts(recipient_link_id,values_json,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(recipient_link_id) DO UPDATE SET values_json=excluded.values_json,revision=excluded.revision,updated_at=excluded.updated_at",
        )
        .bind(context.link.id, JSON.stringify(answers.prepared), revision, now),
      db
        .prepare(
          "UPDATE form_assignments SET status='in_progress',updated_at=? WHERE recipient_link_id=? AND status!='completed'",
        )
        .bind(now, context.link.id),
      ...cleanupStatements(answers.discarded, now),
    ]);
  } catch (error) {
    await compensateStorageWrites(answers.uploaded, "submission_rolled_back");
    throw error;
  }
  return Response.json(
    { revision },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function draftImage(
  request: Request,
  token: string,
  fieldId: string,
) {
  const { context } = await assignedForm(request, token);
  const [draft] = await getDb()
    .select()
    .from(formResponseDrafts)
    .where(eq(formResponseDrafts.recipientLinkId, context.link.id))
    .limit(1);
  const image = record(draft?.valuesJson ?? null)[fieldId];
  if (!storedImage(image)) throw jsonError("Image not found.", 404);
  const object = await getFilesBucket().get(image.storageKey);
  if (!object) throw jsonError("Image not found.", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function submitForm(request: Request, context: FillContext) {
  const account = await authorizeAssignedRecipient(
    request.headers,
    context.link.assignedUserId,
  );
  if (!account || !context.assignment)
    throw jsonError("This form requires an assigned account.", 403);
  const key = request.headers.get("Idempotency-Key");
  if (!validIdempotencyKey(key))
    throw jsonError("A valid idempotency key is required.", 400);
  const [existing] = await getDb()
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.recipientLinkId, context.link.id),
        eq(submissions.idempotencyKey, key),
      ),
    )
    .limit(1);
  if (existing)
    return Response.json({
      submission: { id: existing.id, status: "completed", reused: true },
    });
  const availability = recipientLinkAvailability(context.link);
  if (!availability.available)
    throw jsonError(availability.message, availability.httpStatus);
  const answers = await prepareAnswers(request, context, false),
    db = getDatabaseBinding(),
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  try {
    await db.batch([
      responseGuard(context, answers.revision),
      db
        .prepare(
          "INSERT INTO submissions(id,template_id,recipient_link_id,template_version_id,idempotency_key,recipient_name,recipient_email,values_json,artifact_generator,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          context.template.id,
          context.link.id,
          context.version.id,
          key,
          account.session.user.name,
          account.session.user.email,
          JSON.stringify(formAnswers(answers.definition, answers.prepared)),
          "form-builder-v1",
          now,
        ),
      db
        .prepare(
          "UPDATE recipient_links SET submission_count=submission_count+1,status='completed',completed_at=?,updated_at=? WHERE id=?",
        )
        .bind(now, now, context.link.id),
      db
        .prepare(
          "UPDATE form_assignments SET status='completed',completed_at=?,updated_at=? WHERE recipient_link_id=?",
        )
        .bind(now, now, context.link.id),
      db
        .prepare(
          "INSERT INTO form_submission_artifacts(submission_id,status,updated_at) VALUES(?,?,?)",
        )
        .bind(id, context.version.fileKey ? "pending" : "not_configured", now),
      db
        .prepare("DELETE FROM form_response_drafts WHERE recipient_link_id=?")
        .bind(context.link.id),
      db
        .prepare(
          "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          context.template.ownerEmail,
          "recipient",
          account.session.user.id,
          "submission.completed",
          "submission",
          id,
          JSON.stringify({
            templateId: context.template.id,
            versionId: context.version.id,
            source: "form_builder",
          }),
          now,
        ),
      ...cleanupStatements(answers.discarded, now),
    ]);
  } catch (error) {
    await compensateStorageWrites(answers.uploaded, "submission_rolled_back");
    const [raced] = await getDb()
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.recipientLinkId, context.link.id),
          eq(submissions.idempotencyKey, key),
        ),
      )
      .limit(1);
    if (raced)
      return Response.json({
        submission: { id: raced.id, status: "completed", reused: true },
      });
    throw error;
  }
  const pdfStatus = context.version.fileKey
    ? await renderSubmissionPdf(
        id,
        context.template.ownerEmail,
        new URL(request.url).origin,
      )
    : "not_configured";
  return Response.json(
    { submission: { id, status: "completed", reused: false, pdfStatus } },
    { status: 201 },
  );
}
export async function renderSubmissionPdf(
  id: string,
  owner: string,
  origin: string,
) {
  const [row] = await getDb()
    .select({
      submission: submissions,
      artifact: formSubmissionArtifacts,
      version: templateVersions,
    })
    .from(submissions)
    .innerJoin(templates, eq(submissions.templateId, templates.id))
    .innerJoin(
      templateVersions,
      eq(submissions.templateVersionId, templateVersions.id),
    )
    .innerJoin(
      formSubmissionArtifacts,
      eq(formSubmissionArtifacts.submissionId, submissions.id),
    )
    .where(and(eq(submissions.id, id), eq(templates.ownerEmail, owner)))
    .limit(1);
  if (!row) throw jsonError("Response not found.", 404);
  if (
    row.artifact.status === "ready" ||
    row.artifact.status === "not_configured"
  )
    return row.artifact.status;
  const db = getDatabaseBinding(),
    token = crypto.randomUUID(),
    now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE form_submission_artifacts SET status='pending',error_code=NULL,lease_token=?,lease_expires_at=?,updated_at=? WHERE submission_id=? AND status IN ('pending','failed') AND (lease_token IS NULL OR lease_expires_at<?)",
    )
    .bind(
      token,
      new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      now,
      id,
      now,
    )
    .all();
  if (
    !result.success ||
    (
      await db
        .prepare(
          "SELECT lease_token FROM form_submission_artifacts WHERE submission_id=?",
        )
        .bind(id)
        .first<{ lease_token: string }>()
    )?.lease_token !== token
  )
    return "pending";
  let uploaded: string | null = null;
  try {
    const definition = parseDefinition(row.version.formDefinitionJson),
      source = await getFilesBucket().get(row.version.fileKey);
    if (!source) throw Error("PDF source unavailable.");
    const answers = JSON.parse(row.submission.valuesJson) as Array<{
        fieldId: string;
        value: unknown;
      }>,
      values = Object.fromEntries(answers.map((a) => [a.fieldId, a.value])),
      images = new Map<
        string,
        { bytes: Uint8Array<ArrayBuffer>; contentType: string }
      >();
    for (const mapping of definition.mappings) {
      const image = values[mapping.fieldId];
      if (!storedImage(image)) continue;
      const object = await getFilesBucket().get(image.storageKey);
      if (!object) throw Error("Saved image unavailable.");
      images.set(mapping.id, {
        bytes: new Uint8Array(await new Response(object.body).arrayBuffer()),
        contentType: image.contentType,
      });
    }
    const placements = outputPlacements(definition, values);
    const bytes = await buildAuthoritativeCompletedPdf({
      sourcePdfBytes: new Uint8Array(
        await new Response(source.body).arrayBuffer(),
      ),
      pageOrder: JSON.parse(row.version.pageOrderJson),
      annotations: placements.annotations,
      values: placements.values,
      images,
      origin,
    });
    if (bytes.length > 35 * 1024 * 1024) throw Error("PDF too large.");
    const checksum = await sha256Hex(bytes),
      fileKey = `submissions/${row.submission.templateId}/${id}/form-${token}.pdf`;
    await getFilesBucket().put(fileKey, bytes.buffer, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { checksum, templateVersionId: row.version.id },
    });
    uploaded = fileKey;
    await db
      .prepare(
        "UPDATE form_submission_artifacts SET status='ready',file_key=?,checksum=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE submission_id=? AND lease_token=?",
      )
      .bind(fileKey, checksum, new Date().toISOString(), id, token)
      .all();
    const saved = await db
      .prepare(
        "SELECT file_key FROM form_submission_artifacts WHERE submission_id=?",
      )
      .bind(id)
      .first<{ file_key: string }>();
    if (saved?.file_key !== fileKey) {
      await compensateStorageWrites([fileKey], "submission_rolled_back");
      return "pending";
    }
    return "ready";
  } catch (error) {
    const code =
      error instanceof Error && error.message.includes("FORM_PDF_OVERFLOW")
        ? "text_overflow"
        : "generation_failed";
    if (uploaded)
      await compensateStorageWrites([uploaded], "submission_rolled_back");
    await db
      .prepare(
        "UPDATE form_submission_artifacts SET status='failed',error_code=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE submission_id=? AND lease_token=?",
      )
      .bind(code, new Date().toISOString(), id, token)
      .all();
    console.error("Form PDF generation failed; answers retained", {
      submissionId: id,
    });
    return "failed";
  }
}
export async function processPendingFormPdfs(origin: string) {
  const rows = await getDb()
    .select({ id: submissions.id, owner: templates.ownerEmail })
    .from(formSubmissionArtifacts)
    .innerJoin(
      submissions,
      eq(formSubmissionArtifacts.submissionId, submissions.id),
    )
    .innerJoin(templates, eq(submissions.templateId, templates.id))
    .where(
      and(
        eq(formSubmissionArtifacts.status, "pending"),
        or(
          isNull(formSubmissionArtifacts.leaseToken),
          lt(formSubmissionArtifacts.leaseExpiresAt, new Date().toISOString()),
        ),
      ),
    )
    .orderBy(asc(formSubmissionArtifacts.updatedAt))
    .limit(5);
  for (const row of rows) await renderSubmissionPdf(row.id, row.owner, origin);
}

export async function responseImage(
  request: Request,
  submissionId: string,
  fieldId: string,
) {
  const { requireRequestOwner } = await import(
    "@/features/templates/template.server"
  );
  const owner = await requireRequestOwner(request);
  const [row] = await getDb()
    .select({ values: submissions.valuesJson })
    .from(submissions)
    .innerJoin(templates, eq(submissions.templateId, templates.id))
    .where(
      and(
        eq(submissions.id, submissionId),
        eq(templates.ownerEmail, owner),
        eq(templates.kind, "form"),
      ),
    )
    .limit(1);
  if (!row) throw jsonError("Response not found.", 404);
  const answers = JSON.parse(row.values) as Array<{
    fieldId: string;
    value: unknown;
  }>;
  const image = answers.find((a) => a.fieldId === fieldId)?.value;
  if (!storedImage(image)) throw jsonError("Image not found.", 404);
  const object = await getFilesBucket().get(image.storageKey);
  if (!object) throw jsonError("Image not found.", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
