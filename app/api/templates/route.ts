import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  formAssignments,
  recipientLinks,
  submissions,
  templates,
  templateVersions,
} from "@/db/schema";
import { createAuditEvent } from "@/features/audit/audit.server";
import { createPageMeta, parsePageQuery } from "@/features/pagination/pagination";
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
import { compensateStorageWrites } from "@/features/storage/storage-cleanup.server";
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
    const searchParams = new URL(request.url).searchParams;
    const pageQuery = parsePageQuery(searchParams, {
      sorts: ["updatedAt", "createdAt", "name"] as const,
      defaultSort: "updatedAt",
    });
    const status = templateStatus(searchParams.get("status"));
    const conditions: SQL[] = [eq(templates.ownerEmail, ownerEmail)];
    if (status === "active") conditions.push(isNull(templates.archivedAt));
    if (status === "archived") conditions.push(isNotNull(templates.archivedAt));
    const search = searchParams.get("search")?.trim().slice(0, 120);
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(or(
        like(templates.name, pattern),
        like(templates.description, pattern),
        like(templates.fileName, pattern),
      )!);
    }
    const sortColumn = {
      updatedAt: templates.updatedAt,
      createdAt: templates.createdAt,
      name: templates.name,
    }[pageQuery.sort];
    const direction = pageQuery.order === "asc" ? asc : desc;
    const db = getDb();
    const [templateRows, totals, templateStats, roleTotals] = await Promise.all([
      db
        .select()
        .from(templates)
        .where(and(...conditions))
        .orderBy(direction(sortColumn), direction(templates.id))
        .limit(pageQuery.pageSize)
        .offset(pageQuery.offset),
      db
        .select({ total: count() })
        .from(templates)
        .where(and(...conditions)),
      db
        .select({
          active: sql<number>`sum(case when ${templates.archivedAt} is null then 1 else 0 end)`,
          archived: sql<number>`sum(case when ${templates.archivedAt} is not null then 1 else 0 end)`,
        })
        .from(templates)
        .where(eq(templates.ownerEmail, ownerEmail)),
      db
        .select({ total: count() })
        .from(recipientLinks)
        .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
        .where(and(
          eq(templates.ownerEmail, ownerEmail),
          isNull(templates.archivedAt),
          isNull(recipientLinks.assignedUserId),
          eq(recipientLinks.templateVersionId, templates.currentVersionId),
        )),
    ]);

    const stats = {
      active: templateStats[0]?.active ?? 0,
      archived: templateStats[0]?.archived ?? 0,
      recipientRoles: roleTotals[0]?.total ?? 0,
    };

    if (templateRows.length === 0) {
      return Response.json(
        {
          items: [],
          stats,
          ...createPageMeta(totals[0]?.total ?? 0, pageQuery),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const templateIds = templateRows.map((template) => template.id);

    const [linkRows, submissionCountRows, assignmentCountRows, versionRows] =
      await Promise.all([
        db
          .select({
            id: recipientLinks.id,
            templateId: recipientLinks.templateId,
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
          .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
          .where(
            and(
              eq(templates.ownerEmail, ownerEmail),
              inArray(templates.id, templateIds),
              isNull(recipientLinks.assignedUserId),
            ),
          ),
        db
          .select({ templateId: submissions.templateId, total: count() })
          .from(submissions)
          .innerJoin(templates, eq(submissions.templateId, templates.id))
          .where(and(
            eq(templates.ownerEmail, ownerEmail),
            inArray(templates.id, templateIds),
          ))
          .groupBy(submissions.templateId),
        db
          .select({ templateId: formAssignments.templateId, total: count() })
          .from(formAssignments)
          .innerJoin(templates, eq(formAssignments.templateId, templates.id))
          .where(and(
            eq(templates.ownerEmail, ownerEmail),
            inArray(templates.id, templateIds),
          ))
          .groupBy(formAssignments.templateId),
        db
          .select({
            id: templateVersions.id,
            templateId: templateVersions.templateId,
            versionNumber: templateVersions.versionNumber,
            rolesJson: templateVersions.rolesJson,
          })
          .from(templateVersions)
          .innerJoin(templates, eq(templateVersions.templateId, templates.id))
          .where(and(
            eq(templates.ownerEmail, ownerEmail),
            inArray(templates.id, templateIds),
          ))
          .orderBy(desc(templateVersions.versionNumber)),
      ]);
    const linksByTemplate = groupBy(linkRows, (row) => row.templateId);
    const versionsByTemplate = groupBy(versionRows, (row) => row.templateId);
    const versionsById = new Map(versionRows.map((row) => [row.id, row]));
    const submissionCounts = new Map(
      submissionCountRows.map((row) => [row.templateId, row.total]),
    );
    const assignmentCounts = new Map(
      assignmentCountRows.map((row) => [row.templateId, row.total]),
    );

    const result = templateRows.map((template) => {
      const links = linksByTemplate.get(template.id) ?? [];
      const version = versionsById.get(template.currentVersionId);
      const templateVersionRows = versionsByTemplate.get(template.id) ?? [];
      const currentRoles = parseVersionRoles(version?.rolesJson ?? "[]");
      const currentRoleIds = new Set(currentRoles.map((role) => role.id));
      return {
        id: template.id,
        name: template.name,
        description: template.description,
        fileName: template.fileName,
        archivedAt: template.archivedAt
          ? toUtcIsoString(template.archivedAt) ?? template.archivedAt
          : null,
        createdAt: toUtcIsoString(template.createdAt) ?? template.createdAt,
        updatedAt: toUtcIsoString(template.updatedAt) ?? template.updatedAt,
        versionNumber: version?.versionNumber ?? 1,
        currentRoles,
        filterRoles: uniqueVersionRoles(
          templateVersionRows.map((row) => row.rolesJson),
        ),
        recipients: links
          .filter((link) => currentRoleIds.has(link.roleId))
          .map((link) => {
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
        submissionCount: submissionCounts.get(template.id) ?? 0,
        assignmentCount: assignmentCounts.get(template.id) ?? 0,
      };
    });

    return Response.json(
      {
        items: result,
        stats,
        ...createPageMeta(totals[0]?.total ?? 0, pageQuery),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list templates", error);
    return jsonError("Templates could not be loaded.", 500);
  }
}

function groupBy<Row, Key>(rows: Row[], keyFor: (row: Row) => Key) {
  const groups = new Map<Key, Row[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
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

function templateStatus(value: string | null): "active" | "archived" | "all" {
  return value === "active" || value === "archived" ? value : "all";
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
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
      db.insert(auditEvents).values(
        createAuditEvent({
          request,
          ownerEmail,
          actorType: "owner",
          actorId: ownerEmail,
          action: "template.created",
          targetType: "template",
          targetId: templateId,
          metadata: { roleCount: roles.length, versionNumber: 1 },
          createdAt: now,
        }),
      ),
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
      await compensateStorageWrites([uploadedKey], "template_create_failed");
    }
    if (isResponse(error)) return error;
    console.error("Failed to save template", error);
    return jsonError("The template could not be saved.", 500);
  }
}
