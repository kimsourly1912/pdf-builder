import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { submissions, templates } from "@/db/schema";
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
    const [row] = await db
      .select({ submission: submissions, template: templates })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .where(and(eq(submissions.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    if (!row || !row.submission.completedFileKey) {
      return jsonError("Completed PDF not found.", 404);
    }
    const object = await getFilesBucket().get(row.submission.completedFileKey);
    if (!object) return jsonError("Completed PDF not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${row.template.name.replaceAll(/[^a-zA-Z0-9_-]/gu, "_")}-completed.pdf"`,
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to download submission", error);
    return jsonError("The completed PDF could not be downloaded.", 500);
  }
}
