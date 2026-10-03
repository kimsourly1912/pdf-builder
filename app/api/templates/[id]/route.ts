import {
  archiveEntity,
  archivedGroup,
  restoreEntity,
} from "@/features/archive/archive.server";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  recipientLinks,
  templates,
  templateVersions,
} from "@/db/schema";
import { createAuditEvent } from "@/features/audit/audit.server";
import { toUtcIsoString } from "@/features/templates/date-time";
import { inspectPdf } from "@/features/templates/file-validation";
import { defaultLinkExpiration } from "@/features/templates/recipient-link-lifecycle";
import { validateTemplateDefinition } from "@/features/templates/submission-validation";
import {
  createRecipientToken,
  getFilesBucket,
  hashRecipientToken,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { compensateStorageWrites } from "@/features/storage/storage-cleanup.server";
import {
  parseTemplateJson,
  parseVersionRoles,
  validRecipientRoles,
} from "@/features/templates/template-write";
import type {
  RecipientRole,
  TemplateAnnotation,
  TemplatePageEntry,
} from "@/features/templates/template.types";

const MAX_PDF_SIZE = 35 * 1024 * 1024;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const row = await findOwnedTemplateVersion(id, ownerEmail);
    if (!row) return jsonError("Template not found.", 404);
    if (row.template.kind === "form") return jsonError("Open this form in Form Builder.", 409);

    return Response.json({
      template: {
        id: row.template.id,
        name: row.template.name,
        description: row.template.description,
        fileName: row.version.fileName,
        versionNumber: row.version.versionNumber,
        annotations:
          parseTemplateJson<TemplateAnnotation[]>(
            row.version.annotationsJson,
          ) ?? [],
        pageOrder:
          parseTemplateJson<TemplatePageEntry[]>(row.version.pageOrderJson) ??
          [],
        roles: parseVersionRoles(row.version.rolesJson),
        updatedAt:
          toUtcIsoString(row.template.updatedAt) ?? row.template.updatedAt,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to load template", error);
    return jsonError("The template could not be loaded.", 500);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let uploadedKey: string | null = null;
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const current = await findOwnedTemplateVersion(id, ownerEmail);
    if (!current) return jsonError("Template not found.", 404);
    if (current.template.kind === "form") return jsonError("Edit this form in Form Builder.", 409);

    const formData = await request.formData();
    const pdf = formData.get("pdf");
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const annotations = parseTemplateJson<TemplateAnnotation[]>(
      formData.get("annotations"),
    );
    const pageOrder = parseTemplateJson<TemplatePageEntry[]>(
      formData.get("pageOrder"),
    );
    const roles = parseTemplateJson<RecipientRole[]>(formData.get("roles"));

    if (!(pdf instanceof File) || pdf.type !== "application/pdf") {
      return jsonError("A PDF file is required.", 400);
    }
    if (!name || name.length > 120) {
      return jsonError(
        "Template name must be between 1 and 120 characters.",
        400,
      );
    }
    if (pdf.size > MAX_PDF_SIZE) {
      return jsonError("The PDF must be 35 MB or smaller.", 400);
    }
    if (!Array.isArray(annotations) || !Array.isArray(pageOrder)) {
      return jsonError("Template editor data is invalid.", 400);
    }
    if (!validRecipientRoles(roles)) {
      return jsonError("Add between 1 and 10 valid recipient roles.", 400);
    }

    const pdfBytes = new Uint8Array(
      await pdf.arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    const pdfInspection = await inspectPdf(pdfBytes);
    if (!pdfInspection) {
      return jsonError("The uploaded file is not a valid PDF.", 400);
    }
    const definitionError = validateTemplateDefinition({
      annotations,
      pageOrder,
      roles,
      sourcePageCount: pdfInspection.pageCount,
    });
    if (definitionError) return jsonError(definitionError, 422);

    const db = getDb();
    const existingLinks = await db
      .select()
      .from(recipientLinks)
      .where(
        and(
          eq(recipientLinks.templateId, id),
          isNull(recipientLinks.assignedUserId),
        ),
      );
    const existingByRole = new Map(
      existingLinks.map((link) => [link.roleId, link]),
    );
    const versionId = crypto.randomUUID();
    const versionNumber = current.version.versionNumber + 1;
    uploadedKey = `templates/${ownerEmail}/${id}/versions/${versionId}.pdf`;
    await getFilesBucket().put(uploadedKey, pdfBytes.buffer, {
      httpMetadata: { contentType: "application/pdf" },
    });

    const now = new Date().toISOString();
    const expiresAt = defaultLinkExpiration(new Date(now));
    const linkRows = await Promise.all(
      roles.map(async (role) => {
        const token = createRecipientToken();
        const existing = existingByRole.get(role.id);
        return {
          token,
          role,
          existing,
          values: {
            id: existing?.id ?? crypto.randomUUID(),
            templateId: id,
            templateVersionId: versionId,
            roleId: role.id,
            roleName: role.name.trim(),
            roleColor: role.color,
            tokenHash: await hashRecipientToken(token),
            status: "active",
            expiresAt,
            maxSubmissions: 1,
            submissionCount: 0,
            revokedAt: null,
            completedAt: null,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          },
        };
      }),
    );
    const currentRoleIds = new Set(roles.map((role) => role.id));
    const removedLinks = existingLinks.filter(
      (link) => !currentRoleIds.has(link.roleId),
    );

    await db.batch([
      db.insert(templateVersions).values({
        id: versionId,
        templateId: id,
        versionNumber,
        fileKey: uploadedKey,
        fileName: pdf.name || current.version.fileName,
        annotationsJson: JSON.stringify(annotations),
        pageOrderJson: JSON.stringify(pageOrder),
        rolesJson: JSON.stringify(roles),
        publishedAt: now,
      }),
      db
        .update(templates)
        .set({
          name,
          description: description.slice(0, 500),
          fileKey: uploadedKey,
          fileName: pdf.name || current.version.fileName,
          annotationsJson: JSON.stringify(annotations),
          pageOrderJson: JSON.stringify(pageOrder),
          currentVersionId: versionId,
          updatedAt: now,
        })
        .where(and(eq(templates.id, id), eq(templates.ownerEmail, ownerEmail))),
      ...linkRows.map((link) =>
        link.existing
          ? db
              .update(recipientLinks)
              .set(link.values)
              .where(eq(recipientLinks.id, link.existing.id))
          : db.insert(recipientLinks).values(link.values),
      ),
      ...removedLinks.map((link) =>
        db
          .update(recipientLinks)
          .set({ status: "revoked", revokedAt: now, updatedAt: now })
          .where(eq(recipientLinks.id, link.id)),
      ),
      db.insert(auditEvents).values(
        createAuditEvent({
          request,
          ownerEmail,
          actorType: "owner",
          actorId: ownerEmail,
          action: "template.published",
          targetType: "template",
          targetId: id,
          metadata: { roleCount: roles.length, versionNumber },
          createdAt: now,
        }),
      ),
    ]);

    const origin = new URL(request.url).origin;
    return Response.json({
      template: {
        id,
        name,
        versionNumber,
        shareLinks: linkRows.map((link) => ({
          roleId: link.role.id,
          roleName: link.role.name.trim(),
          roleColor: link.role.color,
          expiresAt,
          maxSubmissions: 1,
          url: `${origin}/fill/${link.token}`,
        })),
      },
    });
  } catch (error) {
    if (uploadedKey) {
      await compensateStorageWrites([uploadedKey], "template_update_failed");
    }
    if (isResponse(error)) return error;
    console.error("Failed to update template", error);
    return jsonError("The new template version could not be saved.", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireRequestOwner(request),
      { id } = await context.params,
      body = (await request.json()) as Record<string,unknown>;
    if (body.action !== "restore") return jsonError("Choose restore.", 400);
    const { record } = await archivedGroup(owner, "template", id);
    await restoreEntity(owner, "template", id, record.archived_at);
    return Response.json({
      template: { id, disposition: "restore", archivedAt: null },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    return jsonError("The template could not be restored.", 500);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireRequestOwner(request),
      { id } = await context.params;
    await archiveEntity(owner, "template", id);
    const { record } = await archivedGroup(owner, "template", id);
    return Response.json({
      template: { id, disposition: "archive", archivedAt: record.archived_at },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    return jsonError("The template could not be archived.", 500);
  }
}

async function findOwnedTemplateVersion(id: string, ownerEmail: string) {
  const [row] = await getDb()
    .select({ template: templates, version: templateVersions })
    .from(templates)
    .innerJoin(
      templateVersions,
      eq(templates.currentVersionId, templateVersions.id),
    )
    .where(
      and(
        eq(templates.id, id),
        eq(templates.ownerEmail, ownerEmail),
        isNull(templates.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
