import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  recipientLinks,
  submissions,
  templates,
  templateVersions,
} from "@/db/schema";
import {
  defaultLinkExpiration,
  recipientLinkAvailability,
} from "@/features/templates/recipient-link-lifecycle";
import { toUtcIsoString } from "@/features/templates/date-time";
import {
  createRecipientToken,
  getFilesBucket,
  hashRecipientToken,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { inspectPdf } from "@/features/templates/file-validation";
import { validateTemplateDefinition } from "@/features/templates/submission-validation";
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

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const db = getDb();
    const templateRows = await db
      .select()
      .from(templates)
      .where(eq(templates.ownerEmail, ownerEmail))
      .orderBy(desc(templates.updatedAt));

    const result = await Promise.all(
      templateRows.map(async (template) => {
        const [links, submissionRows, currentVersion, versionRows] = await Promise.all([
          db
            .select({
              id: recipientLinks.id,
              roleId: recipientLinks.roleId,
              roleName: recipientLinks.roleName,
              roleColor: recipientLinks.roleColor,
              status: recipientLinks.status,
              expiresAt: recipientLinks.expiresAt,
              maxSubmissions: recipientLinks.maxSubmissions,
              submissionCount: recipientLinks.submissionCount,
              revokedAt: recipientLinks.revokedAt,
              completedAt: recipientLinks.completedAt,
              templateVersionId: recipientLinks.templateVersionId,
            })
            .from(recipientLinks)
            .where(
              and(
                eq(recipientLinks.templateId, template.id),
                isNull(recipientLinks.assignedUserId),
              ),
            ),
          db
            .select({ id: submissions.id })
            .from(submissions)
            .where(eq(submissions.templateId, template.id)),
          db
            .select({
              versionNumber: templateVersions.versionNumber,
              rolesJson: templateVersions.rolesJson,
            })
            .from(templateVersions)
            .where(eq(templateVersions.id, template.currentVersionId))
            .limit(1),
          db
            .select({ rolesJson: templateVersions.rolesJson })
            .from(templateVersions)
            .where(eq(templateVersions.templateId, template.id))
            .orderBy(desc(templateVersions.versionNumber)),
        ]);
        const version = currentVersion[0];
        const currentRoles = parseVersionRoles(version?.rolesJson ?? "[]");
        const currentRoleIds = new Set(currentRoles.map((role) => role.id));
        return {
          id: template.id,
          name: template.name,
          description: template.description,
          fileName: template.fileName,
          createdAt: toUtcIsoString(template.createdAt) ?? template.createdAt,
          updatedAt: toUtcIsoString(template.updatedAt) ?? template.updatedAt,
          versionNumber: version?.versionNumber ?? 1,
          currentRoles,
          filterRoles: uniqueVersionRoles(versionRows.map((row) => row.rolesJson)),
          recipients: links.filter((link) => currentRoleIds.has(link.roleId)).map((link) => {
            const normalizedLink = {
              ...link,
              expiresAt: link.expiresAt
                ? toUtcIsoString(link.expiresAt) ?? link.expiresAt
                : null,
              revokedAt: link.revokedAt
                ? toUtcIsoString(link.revokedAt) ?? link.revokedAt
                : null,
              completedAt: link.completedAt
                ? toUtcIsoString(link.completedAt) ?? link.completedAt
                : null,
            };
            return {
              ...normalizedLink,
              status: recipientLinkAvailability(normalizedLink).state,
            };
          }),
          submissionCount: submissionRows.length,
        };
      }),
    );

    return Response.json({ templates: result });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list templates", error);
    return jsonError("Templates could not be loaded.", 500);
  }
}

function uniqueVersionRoles(rolesJsonValues: string[]) {
  const roles = new Map<string, RecipientRole>();
  for (const rolesJson of rolesJsonValues) {
    for (const role of parseVersionRoles(rolesJson)) {
      if (!roles.has(role.id)) roles.set(role.id, role);
    }
  }
  return [...roles.values()];
}

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const ownerEmail = await requireRequestOwner(request);
    const formData = await request.formData();
    const pdf = formData.get("pdf");
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const annotations = parseTemplateJson<TemplateAnnotation[]>(
      formData.get("annotations"),
    );
    const pageOrder = parseTemplateJson<TemplatePageEntry[]>(formData.get("pageOrder"));
    const roles = parseTemplateJson<RecipientRole[]>(formData.get("roles"));

    if (!(pdf instanceof File) || pdf.type !== "application/pdf") {
      return jsonError("A PDF file is required.", 400);
    }
    if (!name || name.length > 120) {
      return jsonError("Template name must be between 1 and 120 characters.", 400);
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
    const pdfBytes = new Uint8Array(await pdf.arrayBuffer()) as Uint8Array<ArrayBuffer>;
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

    const templateId = crypto.randomUUID();
    const templateVersionId = crypto.randomUUID();
    uploadedKey = `templates/${ownerEmail}/${templateId}/source.pdf`;
    const files = getFilesBucket();
    await files.put(uploadedKey, pdfBytes.buffer, {
      httpMetadata: { contentType: "application/pdf" },
    });

    const now = new Date().toISOString();
    const expiresAt = defaultLinkExpiration(new Date(now));
    const linkRows = await Promise.all(
      roles.map(async (role) => {
        const token = createRecipientToken();
        return {
          row: {
            id: crypto.randomUUID(),
            templateId,
            templateVersionId,
            roleId: role.id,
            roleName: role.name,
            roleColor: role.color,
            tokenHash: await hashRecipientToken(token),
            status: "active",
            expiresAt,
            maxSubmissions: 1,
            submissionCount: 0,
            createdAt: now,
            updatedAt: now,
          },
          token,
        };
      }),
    );

    const db = getDb();
    await db.batch([
      db.insert(templates).values({
        id: templateId,
        ownerEmail,
        name,
        description: description.slice(0, 500),
        fileKey: uploadedKey,
        fileName: pdf.name || "template.pdf",
        annotationsJson: JSON.stringify(annotations),
        pageOrderJson: JSON.stringify(pageOrder),
        currentVersionId: templateVersionId,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(templateVersions).values({
        id: templateVersionId,
        templateId,
        versionNumber: 1,
        fileKey: uploadedKey,
        fileName: pdf.name || "template.pdf",
        annotationsJson: JSON.stringify(annotations),
        pageOrderJson: JSON.stringify(pageOrder),
        rolesJson: JSON.stringify(roles),
        publishedAt: now,
      }),
      db.insert(recipientLinks).values(linkRows.map(({ row }) => row)),
    ]);

    const shareLinks = linkRows.map(({ row, token }) => ({
      roleId: row.roleId,
      roleName: row.roleName,
      roleColor: row.roleColor,
      expiresAt: row.expiresAt,
      maxSubmissions: row.maxSubmissions,
      url: `${new URL(request.url).origin}/fill/${token}`,
    }));

    return Response.json(
      { template: { id: templateId, name, versionNumber: 1, shareLinks } },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey) {
      await getFilesBucket().delete(uploadedKey).catch(() => undefined);
    }
    if (isResponse(error)) return error;
    console.error("Failed to save template", error);
    return jsonError("The template could not be saved.", 500);
  }
}
