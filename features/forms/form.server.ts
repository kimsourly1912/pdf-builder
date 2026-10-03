import "server-only";
import { notArchived } from "@/features/archive/archive";
import {
  parsePageQuery,
  createPageMeta,
} from "@/features/pagination/pagination";
import { and, desc, eq, isNull, count, like } from "drizzle-orm";
import { getDatabaseBinding, getDb } from "@/db";
import {
  templates,
  templateVersions,
  formSubmissionArtifacts,
  submissionReviews,
  submissions,
  user,
  recipientProfiles,
} from "@/db/schema";
import {
  compensateStorageWrites,
  createStorageCleanupRows,
} from "@/features/storage/storage-cleanup.server";
import {
  inspectPdf,
  sanitizeImage,
} from "@/features/templates/file-validation";
import {
  getFilesBucket,
  jsonError,
  requireRequestOwner,
  isResponse,
} from "@/features/templates/template.server";
import {
  EMPTY_FORM,
  definitionSchema,
  FORM_ASSIGNMENT_ROLE,
  formAnnotations,
  outputPlacements,
} from "./form";
import type { FormDefinition } from "./form";
import { buildAuthoritativeCompletedPdf } from "@/features/templates/completed-pdf.server";

export async function formResponse(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (isResponse(error)) return error;
    if (
      error instanceof Error &&
      /FORM_CHANGED|FORM_RESPONSE_CHANGED/u.test(error.message)
    )
      return jsonError("This form changed. Reload before saving.", 409);
    if (error instanceof Error && error.message.includes("FORM_PDF_OVERFLOW"))
      return jsonError(
        "An answer cannot fit its PDF box. Enlarge the placement or shorten the sample answer.",
        422,
      );
    console.error("Form operation failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return jsonError("This form operation could not be completed.", 500);
  }
}
export async function formBody(request: Request) {
  const text = await request.text();
  if (text.length > 1000000)
    throw jsonError("This form definition is too large.", 413);
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
    return body as Record<string, unknown>;
  } catch {
    throw jsonError("Enter valid form data.", 400);
  }
}
export async function ownedForm(owner: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, id),
        eq(templates.ownerEmail, owner),
        eq(templates.kind, "form"),
        isNull(templates.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw jsonError("Form not found or archived.", 404);
  return row;
}
export function parseDefinition(value: string | null) {
  return definitionSchema.parse(
    JSON.parse(value ?? JSON.stringify(EMPTY_FORM)),
  );
}
export async function listForms(request: Request) {
  const owner = await requireRequestOwner(request);
  const params = new URL(request.url).searchParams;
  const query = parsePageQuery(params, {
    sorts: ["updated"],
    defaultSort: "updated",
  });
  const search = (params.get("search") ?? "").trim().slice(0, 160);
  const where = and(
    eq(templates.ownerEmail, owner),
    eq(templates.kind, "form"),
    isNull(templates.archivedAt),
    search ? like(templates.name, `%${search}%`) : undefined,
  );
  const [totals] = await getDb()
    .select({ total: count() })
    .from(templates)
    .where(where);
  const rows = await getDb()
    .select({
      id: templates.id,
      name: templates.name,
      description: templates.description,
      revision: templates.formRevision,
      versionId: templates.currentVersionId,
      updatedAt: templates.updatedAt,
      fileName: templates.fileName,
    })
    .from(templates)
    .where(where)
    .orderBy(desc(templates.updatedAt))
    .limit(query.pageSize)
    .offset(query.offset);
  return Response.json(
    { items: rows, ...createPageMeta(totals.total, query) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function createForm(request: Request) {
  const owner = await requireRequestOwner(request);
  const body = await formBody(request);
  const id = crypto.randomUUID(),
    revision = crypto.randomUUID(),
    now = new Date().toISOString();
  const name =
    String(body.name ?? "Untitled form")
      .trim()
      .slice(0, 160) || "Untitled form";
  await getDb()
    .insert(templates)
    .values({
      id,
      ownerEmail: owner,
      name,
      kind: "form",
      formDraftJson: JSON.stringify(EMPTY_FORM),
      formRevision: revision,
      description: "",
      fileKey: "",
      fileName: "",
      annotationsJson: "[]",
      pageOrderJson: "[]",
      currentVersionId: "",
      createdAt: now,
      updatedAt: now,
    });
  return Response.json({ id, revision }, { status: 201 });
}
export async function getForm(request: Request, id: string) {
  const row = await ownedForm(await requireRequestOwner(request), id);
  const [version] = row.currentVersionId
    ? await getDb()
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.id, row.currentVersionId))
        .limit(1)
    : [];
  return Response.json(
    {
      id,
      name: row.name,
      description: row.description,
      revision: row.formRevision,
      definition: parseDefinition(row.formDraftJson),
      fileName: row.fileName,
      publishedVersion: version?.versionNumber ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
function guard(id: string, owner: string, revision: string) {
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO form_builder_guards(id,template_id,revision,owner_email) VALUES(?,?,?,?)",
    )
    .bind(crypto.randomUUID(), id, revision, owner);
}
export async function saveForm(request: Request, id: string, publish = false) {
  const owner = await requireRequestOwner(request),
    row = await ownedForm(owner, id),
    body = await formBody(request);
  const parsed = definitionSchema.safeParse(body.definition);
  if (!parsed.success)
    throw jsonError(
      parsed.error.issues[0]?.message ?? "Form settings are invalid.",
      422,
    );
  const definition = parsed.data;
  if (definition.pageCount !== parseDefinition(row.formDraftJson).pageCount)
    throw jsonError("Upload the source PDF to change its pages.", 422);
  if (publish && !definition.fields.some((f) => f.type !== "section"))
    throw jsonError("Add at least one input before publishing.", 422);
  const name = String(body.name ?? "").trim(),
    description = String(body.description ?? "").trim();
  if (!name || name.length > 160 || description.length > 500)
    throw jsonError(
      "Enter a form name of up to 160 characters and a description of up to 500 characters.",
      422,
    );
  const revision = crypto.randomUUID(),
    now = new Date().toISOString(),
    db = getDatabaseBinding();
  const statements = [guard(id, owner, String(body.revision ?? ""))];
  let versionId = row.currentVersionId,
    versionNumber: number | null = null;
  if (publish) {
    const [last] = await getDb()
      .select({ number: templateVersions.versionNumber })
      .from(templateVersions)
      .where(eq(templateVersions.templateId, id))
      .orderBy(desc(templateVersions.versionNumber))
      .limit(1);
    versionNumber = (last?.number ?? 0) + 1;
    versionId = crypto.randomUUID();
    const pages = Array.from({ length: definition.pageCount }, (_, i) => ({
      id: `page_${i + 1}`,
      sourcePage: i + 1,
      rotation: 0,
    }));
    statements.push(
      db
        .prepare(
          "INSERT INTO template_versions(id,template_id,version_number,file_key,file_name,annotations_json,page_order_json,roles_json,form_definition_json,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          versionId,
          id,
          versionNumber,
          row.fileKey,
          row.fileName,
          JSON.stringify(formAnnotations(definition)),
          JSON.stringify(pages),
          JSON.stringify([FORM_ASSIGNMENT_ROLE]),
          JSON.stringify({
            ...definition,
            presentation: { title: name, description },
          }),
          now,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        "UPDATE templates SET name=?,description=?,form_draft_json=?,form_revision=?,current_version_id=?,updated_at=? WHERE id=? AND owner_email=?",
      )
      .bind(
        name,
        description,
        JSON.stringify(definition),
        revision,
        versionId,
        now,
        id,
        owner,
      ),
  );
  statements.push(
    db
      .prepare(
        "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        owner,
        "owner",
        owner,
        publish ? "form.published" : "form.draft_saved",
        "template",
        id,
        JSON.stringify({ versionNumber }),
        now,
      ),
  );
  await db.batch(statements);
  return Response.json({ revision, versionNumber });
}
export async function uploadFormPdf(request: Request, id: string) {
  const owner = await requireRequestOwner(request),
    row = await ownedForm(owner, id);
  const data = await request.formData(),
    file = data.get("pdf");
  if (!(file instanceof File) || !file.size || file.size > 35 * 1024 * 1024)
    throw jsonError("Choose a PDF up to 35 MB.", 422);
  const bytes = new Uint8Array(
      await file.arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>,
    info = await inspectPdf(bytes);
  if (!info || info.pageCount > 100)
    throw jsonError("Choose a valid PDF with up to 100 pages.", 422);
  const key = `forms/${id}/sources/${crypto.randomUUID()}.pdf`,
    revision = crypto.randomUUID(),
    now = new Date().toISOString();
  const definition: FormDefinition = {
    ...parseDefinition(row.formDraftJson),
    mappings: [],
    pageCount: info.pageCount,
  };
  await getFilesBucket().put(key, bytes.buffer, {
    httpMetadata: { contentType: "application/pdf" },
  });
  try {
    const db = getDatabaseBinding();
    const statements = [
      guard(id, owner, String(data.get("revision") ?? "")),
      db
        .prepare(
          "UPDATE templates SET file_key=?,file_name=?,form_revision=?,form_draft_json=?,updated_at=? WHERE id=?",
        )
        .bind(
          key,
          file.name.slice(0, 160),
          revision,
          JSON.stringify(definition),
          now,
          id,
        ),
    ];
    const [used] = row.fileKey
      ? await getDb()
          .select({ id: templateVersions.id })
          .from(templateVersions)
          .where(eq(templateVersions.fileKey, row.fileKey))
          .limit(1)
      : [];
    if (row.fileKey && !used)
      for (const cleanup of createStorageCleanupRows(
        [row.fileKey],
        "template_update_failed",
        now,
      ))
        statements.push(
          db
            .prepare(
              "INSERT INTO storage_cleanup_jobs(id,object_key,reason,attempt_count,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            )
            .bind(cleanup.id, cleanup.objectKey, cleanup.reason, 0, now, now),
        );
    await db.batch(statements);
  } catch (error) {
    await compensateStorageWrites([key], "template_update_failed");
    throw error;
  }
  return Response.json({
    revision,
    definition,
    fileName: file.name.slice(0, 160),
  });
}
export async function formPdf(request: Request, id: string) {
  const row = await ownedForm(await requireRequestOwner(request), id),
    object = row.fileKey ? await getFilesBucket().get(row.fileKey) : null;
  if (!object) throw jsonError("Upload a source PDF first.", 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function previewPdf(request: Request, id: string) {
  const row = await ownedForm(await requireRequestOwner(request), id);
  const multipart = request.headers
    .get("content-type")
    ?.includes("multipart/form-data");
  const media = multipart ? await request.formData() : null;
  const body = media
    ? await formBody(
        new Request(request.url, {
          method: "POST",
          body: String(media.get("payload") ?? ""),
        }),
      )
    : await formBody(request);
  const parsed = definitionSchema.safeParse(body.definition);
  if (!parsed.success)
    throw jsonError("Check the form definition before previewing.", 422);
  const definition = parsed.data;
  if (definition.pageCount !== parseDefinition(row.formDraftJson).pageCount)
    throw jsonError("PDF pages changed; reload the form.", 409);
  const object = row.fileKey ? await getFilesBucket().get(row.fileKey) : null;
  if (!object)
    throw jsonError("Upload a PDF before previewing its output.", 422);
  const values =
    body.values &&
    typeof body.values === "object" &&
    !Array.isArray(body.values)
      ? (body.values as Record<string, unknown>)
      : {};
  const images = new Map<
    string,
    { bytes: Uint8Array<ArrayBuffer>; contentType: string }
  >();
  if (media) {
    let count = 0;
    for (const [key, file] of media.entries()) {
      if (!key.startsWith("image:")) continue;
      const field = definition.fields.find(
        (f) => f.id === key.slice(6) && ["photo", "signature"].includes(f.type),
      );
      if (
        !field ||
        !(file instanceof File) ||
        file.size > 8 * 1024 * 1024 ||
        ++count > 20
      )
        throw jsonError("Choose valid preview images up to 8 MB.", 422);
      const image = sanitizeImage(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      );
      if (!image) throw jsonError("Choose PNG or JPEG preview images.", 422);
      for (const mapping of definition.mappings.filter(
        (m) => m.fieldId === field.id,
      ))
        images.set(mapping.id, {
          bytes: image.bytes,
          contentType: image.contentType,
        });
    }
  }
  const placements = outputPlacements(definition, values);
  const bytes = await buildAuthoritativeCompletedPdf({
    sourcePdfBytes: new Uint8Array(
      await new Response(object.body).arrayBuffer(),
    ),
    pageOrder: Array.from({ length: definition.pageCount }, (_, i) => ({
      id: `p${i}`,
      sourcePage: i + 1,
      rotation: 0,
    })),
    annotations: placements.annotations,
    values: placements.values,
    images,
    origin: new URL(request.url).origin,
  });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function formResponses(request: Request, id: string) {
  const owner = await requireRequestOwner(request);
  await ownedForm(owner, id);
  const params = new URL(request.url).searchParams;
  const query = parsePageQuery(params, {
    sorts: ["submitted"],
    defaultSort: "submitted",
  });
  const selected = params.get("response");
  const where = and(
    eq(submissions.templateId, id),
    notArchived("submission", submissions.id),
    selected ? eq(submissions.id, selected) : undefined,
  );
  const [totals] = await getDb()
    .select({ total: count() })
    .from(submissions)
    .where(where);
  const rows = await getDb()
    .select({
      id: submissions.id,
      name: submissions.recipientName,
      email: submissions.recipientEmail,
      submittedAt: submissions.submittedAt,
      answersJson: submissions.valuesJson,
      pdfStatus: formSubmissionArtifacts.status,
      pdfError: formSubmissionArtifacts.errorCode,
      versionId: submissions.templateVersionId,
      reviewStatus: submissionReviews.status,
      fileKey: formSubmissionArtifacts.fileKey,
    })
    .from(submissions)
    .leftJoin(
      formSubmissionArtifacts,
      eq(formSubmissionArtifacts.submissionId, submissions.id),
    )
    .leftJoin(submissionReviews, eq(submissionReviews.submissionId, submissions.id))
    .where(where)
    .orderBy(desc(submissions.submittedAt))
    .limit(query.pageSize)
    .offset(query.offset);
  return Response.json(
    {
      ...createPageMeta(totals.total, query),
      items: rows.map((r) => ({
        ...r,
        reviewStatus: r.reviewStatus ?? "pending",
        answers: (
          JSON.parse(r.answersJson) as Array<{
            fieldId: string;
            value: unknown;
          }>
        ).map((a) => {
          const image = a.value as {
            kind?: string;
            contentType?: string;
            width?: number;
            height?: number;
            size?: number;
          } | null;
          return image &&
            typeof image === "object" &&
            image.kind === "submission-image"
            ? {
                ...a,
                value: {
                  kind: image.kind,
                  contentType: image.contentType,
                  width: image.width,
                  height: image.height,
                  size: image.size,
                  url: `/api/forms/submissions/${r.id}/images/${a.fieldId}`,
                },
              }
            : a;
        }),
        answersJson: undefined,
        fileKey: undefined,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function findAssignmentAccount(owner: string, email: string) {
  const [row] = await getDb()
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .innerJoin(recipientProfiles, eq(recipientProfiles.userId, user.id))
    .where(
      and(
        eq(user.email, email.trim().toLowerCase()),
        eq(recipientProfiles.createdByEmail, owner),
      ),
    )
    .limit(1);
  if (!row)
    throw jsonError(
      "No managed account matches this email. Create or activate the account in Accounts, then assign the form.",
      422,
    );
  return row;
}
