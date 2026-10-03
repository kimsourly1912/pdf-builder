import "server-only";
import { getDatabaseBinding } from "@/db";
import { formBody, parseDefinition } from "@/features/forms/form.server";
import {
  createRecipientToken,
  hashRecipientToken,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

type ReviewRow = {
  id: string;
  templateId: string;
  templateName: string;
  kind: string;
  versionId: string;
  versionNumber: number;
  name: string;
  email: string;
  submittedAt: string;
  answersJson: string;
  pdfStatus: string | null;
  pdfError: string | null;
  hasPdf: number;
  status: string | null;
  reason: string | null;
  revision: string | null;
  reviewedAt: string | null;
  linkId: string;
  assignmentId: string | null;
  assignmentRevision: string | null;
  userId: string | null;
  definitionJson: string | null;
  initialJson: string | null;
  currentLinkId: string | null;
};
async function ownedReview(owner: string, id: string) {
  const row = await getDatabaseBinding()
    .prepare(
      `SELECT s.id,s.template_id templateId,t.name templateName,t.kind,v.id versionId,v.version_number versionNumber,
    s.recipient_name name,s.recipient_email email,s.submitted_at submittedAt,s.values_json answersJson,
    a.status pdfStatus,a.error_code pdfError,CASE WHEN COALESCE(a.file_key,s.completed_file_key) IS NOT NULL THEN 1 ELSE 0 END hasPdf,
    h.status,h.reason,h.revision,h.reviewed_at reviewedAt,s.recipient_link_id linkId,
    f.id assignmentId,f.updated_at assignmentRevision,f.user_id userId,f.recipient_link_id currentLinkId,
    v.form_definition_json definitionJson,f.initial_values_json initialJson
    FROM submissions s JOIN templates t ON t.id=s.template_id JOIN template_versions v ON v.id=s.template_version_id
    LEFT JOIN form_submission_artifacts a ON a.submission_id=s.id LEFT JOIN submission_reviews h ON h.submission_id=s.id
    LEFT JOIN recipient_links l ON l.id=s.recipient_link_id
    LEFT JOIN form_assignments f ON f.user_id=l.assigned_user_id AND f.template_version_id=s.template_version_id AND f.role_id=l.role_id
    WHERE s.id=? AND t.owner_email=? AND NOT EXISTS(SELECT 1 FROM archive_records r WHERE r.entity_type='submission' AND r.entity_id=s.id)`,
    )
    .bind(id, owner)
    .first<ReviewRow>();
  if (!row)
    throw jsonError(
      "Submission not found. Check Archive if it was archived.",
      404,
    );
  return row;
}
export async function reviewDetail(owner: string, id: string) {
  const row = await ownedReview(owner, id);
  const db = getDatabaseBinding();
  const candidate = row.userId
    ? await db
        .prepare(
          "SELECT id,full_name name FROM candidates WHERE owner_email=? AND user_id=? ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(owner, row.userId)
        .first<{ id: string; name: string }>()
    : null;
  const previous = await db
    .prepare(
      "SELECT s.id,s.submitted_at at,h.reason FROM submission_reviews h JOIN submissions s ON s.id=h.submission_id WHERE h.correction_link_id=? AND h.owner_email=?",
    )
    .bind(row.linkId, owner)
    .first<{ id: string; at: string; reason: string }>();
  const next = await db
    .prepare(
      "SELECT s.id FROM submission_reviews h JOIN submissions s ON s.recipient_link_id=h.correction_link_id WHERE h.submission_id=? AND h.owner_email=? ORDER BY s.submitted_at DESC LIMIT 1",
    )
    .bind(id, owner)
    .first<{ id: string }>();
  const answers = (
    JSON.parse(row.answersJson) as Array<{ fieldId: string; value: unknown }>
  ).map((answer) => {
    const image = answer.value as { kind?: string } | null;
    return image &&
      typeof image === "object" &&
      image.kind === "submission-image"
      ? {
          ...answer,
          value: {
            kind: "submission-image",
            url:
              row.kind === "form"
                ? `/api/forms/submissions/${id}/images/${answer.fieldId}`
                : `/api/submissions/${id}/images/${answer.fieldId}`,
          },
        }
      : answer;
  });
  return {
    id: row.id,
    templateId: row.templateId,
    templateName: row.templateName,
    kind: row.kind,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    name: row.name,
    email: row.email,
    submittedAt: row.submittedAt,
    answers,
    pdfStatus: row.pdfStatus ?? (row.hasPdf ? "ready" : "not_configured"),
    pdfError: row.pdfError,
    reviewStatus: row.status ?? "pending",
    reason: row.reason ?? "",
    revision: row.revision ?? "",
    reviewedAt: row.reviewedAt,
    canRequestCorrections:
      !!row.assignmentId && row.currentLinkId === row.linkId && !row.status,
    candidate,
    previous,
    next,
  };
}
export async function reviewSubmission(request: Request, id: string) {
  const owner = await requireRequestOwner(request);
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    throw jsonError("Use this site to review submissions.", 403);
  const body = await formBody(request);
  if (body.action !== "accept" && body.action !== "request_corrections")
    throw jsonError("Choose Accept submission or Request corrections.", 422);
  const row = await ownedReview(owner, id);
  if (body.expectedRevision !== (row.revision ?? "") || row.status)
    throw jsonError(
      "This submission has already been reviewed. Refresh to see the decision.",
      409,
    );
  const correction = body.action === "request_corrections";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length > 2000 || (correction && reason.length < 3))
    throw jsonError("Explain what needs correcting (3–2000 characters).", 422);
  if (correction && (!row.assignmentId || row.currentLinkId !== row.linkId))
    throw jsonError(
      "Only the current account assignment can receive a correction request.",
      409,
    );
  const db = getDatabaseBinding(),
    now = new Date().toISOString(),
    revision = crypto.randomUUID(),
    linkId = correction ? crypto.randomUUID() : null;
  const status = correction ? "corrections_requested" : "accepted";
  // The first statement checks live ownership, archive/access and assignment state inside the batch.
  // Every following write is gated by this request's unique decision revision.
  const decision = db
    .prepare(
      `INSERT INTO submission_reviews(submission_id,owner_email,status,reason,revision,reviewed_at,reviewed_by)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM submissions s JOIN templates t ON t.id=s.template_id WHERE s.id=? AND t.owner_email=?
      AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='submission' AND a.entity_id=s.id))
      AND (?=0 OR EXISTS(SELECT 1 FROM form_assignments f JOIN recipient_links l ON l.id=f.recipient_link_id JOIN recipient_profiles p ON p.user_id=f.user_id JOIN user u ON u.id=f.user_id
        WHERE f.id=? AND f.recipient_link_id=? AND f.updated_at=? AND f.status='completed' AND l.status='completed' AND p.created_by_email=? AND COALESCE(u.banned,0)=0
        AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE (a.entity_type='account' AND a.entity_id=f.user_id) OR (a.entity_type='template' AND a.entity_id=f.template_id))))
    ON CONFLICT(submission_id) DO NOTHING`,
    )
    .bind(
      id,
      owner,
      status,
      reason,
      revision,
      now,
      owner,
      id,
      owner,
      correction ? 1 : 0,
      row.assignmentId,
      row.linkId,
      row.assignmentRevision,
      owner,
    );
  const statements = [decision];
  if (correction) {
    const hash = await hashRecipientToken(createRecipientToken());
    statements.push(
      db
        .prepare(
          `INSERT INTO recipient_links(id,template_id,template_version_id,role_id,role_name,role_color,assigned_user_id,token_hash,status,max_submissions,submission_count,created_at,updated_at)
      SELECT ?,template_id,template_version_id,role_id,role_name,role_color,assigned_user_id,?,'active',1,0,?,? FROM recipient_links WHERE id=?
      AND EXISTS(SELECT 1 FROM submission_reviews WHERE submission_id=? AND revision=?)`,
        )
        .bind(linkId, hash, now, now, row.linkId, id, revision),
    );
    statements.push(
      db
        .prepare(
          "UPDATE submission_reviews SET correction_link_id=? WHERE submission_id=? AND revision=?",
        )
        .bind(linkId, id, revision),
    );
    statements.push(
      db
        .prepare(
          `UPDATE form_assignments SET recipient_link_id=?,status='assigned',completed_at=NULL,updated_at=? WHERE id=? AND recipient_link_id=?
      AND EXISTS(SELECT 1 FROM submission_reviews WHERE submission_id=? AND revision=?)`,
        )
        .bind(linkId, now, row.assignmentId, row.linkId, id, revision),
    );
    if (row.definitionJson) {
      const definition = parseDefinition(row.definitionJson);
      const answers = JSON.parse(row.answersJson) as Array<{
        fieldId: string;
        value: unknown;
      }>;
      // Original media stay private and immutable. A correction reuploads photos/signatures;
      // no cleanup of a new draft may delete an original submission's image.
      const values = Object.fromEntries(
        answers
          .filter((a) =>
            definition.fields.some(
              (f) =>
                f.id === a.fieldId &&
                f.type !== "photo" &&
                f.type !== "signature",
            ),
          )
          .map((a) => [a.fieldId, a.value]),
      );
      Object.assign(values, JSON.parse(row.initialJson ?? "{}"));
      statements.push(
        db
          .prepare(
            `INSERT INTO form_response_drafts(recipient_link_id,values_json,revision,updated_at)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM submission_reviews WHERE submission_id=? AND revision=?)`,
          )
          .bind(
            linkId,
            JSON.stringify(values),
            crypto.randomUUID(),
            now,
            id,
            revision,
          ),
      );
    }
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at)
    SELECT ?,?,'owner',?,?,'submission',?,?,? WHERE EXISTS(SELECT 1 FROM submission_reviews WHERE submission_id=? AND revision=?)`,
      )
      .bind(
        crypto.randomUUID(),
        owner,
        owner,
        `submission.${status}`,
        id,
        JSON.stringify({
          reason,
          assignmentId: row.assignmentId,
          templateId: row.templateId,
          versionId: row.versionId,
        }),
        now,
        id,
        revision,
      ),
  );
  const results = await db.batch(statements);
  if (!results[0]?.meta?.changes)
    throw jsonError(
      "Submission or account access changed. Refresh before reviewing again.",
      409,
    );
  return Response.json({
    review: await reviewDetail(owner, id),
    assignmentUrl: correction ? `/fill/assigned_${row.assignmentId}` : null,
  });
}
