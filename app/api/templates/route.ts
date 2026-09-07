import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, submissions, templates } from "@/db/schema";
import {
  createRecipientToken,
  getFilesBucket,
  hashRecipientToken,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
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
        const [links, submissionRows] = await Promise.all([
          db
            .select({
              id: recipientLinks.id,
              roleId: recipientLinks.roleId,
              roleName: recipientLinks.roleName,
              roleColor: recipientLinks.roleColor,
              status: recipientLinks.status,
              expiresAt: recipientLinks.expiresAt,
            })
            .from(recipientLinks)
            .where(eq(recipientLinks.templateId, template.id)),
          db
            .select({ id: submissions.id })
            .from(submissions)
            .where(eq(submissions.templateId, template.id)),
        ]);
        return {
          id: template.id,
          name: template.name,
          description: template.description,
          fileName: template.fileName,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          recipients: links,
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

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const ownerEmail = await requireRequestOwner(request);
    const formData = await request.formData();
    const pdf = formData.get("pdf");
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const annotations = parseJson<TemplateAnnotation[]>(
      formData.get("annotations"),
    );
    const pageOrder = parseJson<TemplatePageEntry[]>(formData.get("pageOrder"));
    const roles = parseJson<RecipientRole[]>(formData.get("roles"));

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
    if (!validRoles(roles)) {
      return jsonError("Add between 1 and 10 valid recipient roles.", 400);
    }

    const templateId = crypto.randomUUID();
    uploadedKey = `templates/${ownerEmail}/${templateId}/source.pdf`;
    const files = getFilesBucket();
    await files.put(uploadedKey, await pdf.arrayBuffer(), {
      httpMetadata: { contentType: "application/pdf" },
    });

    const db = getDb();
    await db.insert(templates).values({
      id: templateId,
      ownerEmail,
      name,
      description: description.slice(0, 500),
      fileKey: uploadedKey,
      fileName: pdf.name || "template.pdf",
      annotationsJson: JSON.stringify(annotations),
      pageOrderJson: JSON.stringify(pageOrder),
    });

    const shareLinks = await Promise.all(
      roles.map(async (role) => {
        const token = createRecipientToken();
        await db.insert(recipientLinks).values({
          id: crypto.randomUUID(),
          templateId,
          roleId: role.id,
          roleName: role.name,
          roleColor: role.color,
          tokenHash: await hashRecipientToken(token),
        });
        return {
          roleId: role.id,
          roleName: role.name,
          roleColor: role.color,
          url: `${new URL(request.url).origin}/fill/${token}`,
        };
      }),
    );

    return Response.json(
      { template: { id: templateId, name, shareLinks } },
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

function parseJson<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function validRoles(value: RecipientRole[] | null): value is RecipientRole[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    return false;
  }
  const ids = new Set<string>();
  for (const role of value) {
    if (
      !role ||
      typeof role.id !== "string" ||
      typeof role.name !== "string" ||
      typeof role.color !== "string" ||
      !role.id ||
      !role.name.trim() ||
      !/^#[0-9a-f]{6}$/iu.test(role.color) ||
      ids.has(role.id)
    ) {
      return false;
    }
    ids.add(role.id);
  }
  return true;
}
