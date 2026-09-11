import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { safeResumeFileName } from "@/features/resumes/resume.server";
import { getFilesBucket, isResponse, jsonError, requireRequestOwner } from "@/features/templates/template.server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const [resume] = await getDb().select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail))).limit(1);
    if (!resume) return jsonError("Resume not found.", 404);
    const object = await getFilesBucket().get(resume.fileKey);
    if (!object) return jsonError("Resume PDF not found.", 404);
    return new Response(object.body, { headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeResumeFileName(resume.fileName).replaceAll('"', "_")}"`,
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
    } });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to download resume", error);
    return jsonError("The resume PDF could not be loaded.", 500);
  }
}
