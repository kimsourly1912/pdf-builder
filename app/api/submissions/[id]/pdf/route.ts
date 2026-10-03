import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { submissions, templates, formSubmissionArtifacts } from "@/db/schema";
import { sha256Hex } from "@/features/templates/submission-artifact";
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
      .select({ submission: submissions, template: templates, artifact: formSubmissionArtifacts })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .leftJoin(formSubmissionArtifacts, eq(formSubmissionArtifacts.submissionId, submissions.id))
      .where(and(eq(submissions.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    const fileKey = row?.artifact?.fileKey ?? row?.submission.completedFileKey;
    const checksum = row?.artifact?.checksum ?? row?.submission.completedFileChecksum;
    if (!row || !fileKey) {
      return jsonError("Completed PDF not found.", 404);
    }
    const object = await getFilesBucket().get(fileKey);
    if (!object) return jsonError("Completed PDF not found.", 404);
    const bytes = new Uint8Array(
      await new Response(object.body).arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    if (
      checksum &&
      (await sha256Hex(bytes)) !== checksum
    ) {
      console.error("Completed PDF integrity verification failed", {
        submissionId: row.submission.id,
      });
      return jsonError("The completed PDF failed integrity verification.", 409);
    }
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${row.template.name.replaceAll(/[^a-zA-Z0-9_-]/gu, "_")}-completed.pdf"`,
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to download submission", error);
    return jsonError("The completed PDF could not be downloaded.", 500);
  }
}
