import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { templates, templateVersions } from "@/db/schema";
import {
  getFilesBucket,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const db = getDb();
    const [row] = await db
      .select({ template: templates, version: templateVersions })
      .from(templates)
      .innerJoin(
        templateVersions,
        eq(templates.currentVersionId, templateVersions.id),
      )
      .where(and(eq(templates.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    if (!row) return jsonError("Template not found.", 404);

    const object = await getFilesBucket().get(row.version.fileKey);
    if (!object) return jsonError("Template PDF not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFileName(row.version.fileName)}"`,
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to download template PDF", error);
    return jsonError("The PDF could not be downloaded.", 500);
  }
}

function safeFileName(value: string) {
  return value.replaceAll(/["\r\n]/gu, "_");
}
