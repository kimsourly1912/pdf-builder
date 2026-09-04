import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { templates } from "@/db/schema";
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
    const ownerEmail = requireRequestOwner(request);
    const { id } = await context.params;
    const db = getDb();
    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    if (!template) return jsonError("Template not found.", 404);

    const object = await getFilesBucket().get(template.fileKey);
    if (!object) return jsonError("Template PDF not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFileName(template.fileName)}"`,
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
