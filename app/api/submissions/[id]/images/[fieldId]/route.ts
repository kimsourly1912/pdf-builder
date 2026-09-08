import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { submissions, templates } from "@/db/schema";
import { isStoredSubmissionImage } from "@/features/templates/file-validation";
import { isSubmissionAnswer } from "@/features/templates/label-binding";
import {
  getFilesBucket,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fieldId: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id, fieldId } = await context.params;
    const [row] = await getDb()
      .select({
        templateId: submissions.templateId,
        valuesJson: submissions.valuesJson,
      })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .where(and(eq(submissions.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    if (!row) return jsonError("Submission image not found.", 404);

    const image = findSubmissionImage(row.valuesJson, fieldId);
    if (!image) return jsonError("Submission image not found.", 404);
    const expectedPrefix = `submissions/${row.templateId}/${id}/images/${fieldId}.`;
    if (
      !image.storageKey.startsWith(expectedPrefix) ||
      ![`${expectedPrefix}png`, `${expectedPrefix}jpg`].includes(image.storageKey)
    ) {
      return jsonError("Submission image not found.", 404);
    }
    const object = await getFilesBucket().get(image.storageKey);
    if (!object) return jsonError("Submission image not found.", 404);

    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${fieldId}.${image.contentType === "image/png" ? "png" : "jpg"}"`,
        "Content-Type": image.contentType,
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to load submission image", error);
    return jsonError("The submission image could not be loaded.", 500);
  }
}

function findSubmissionImage(valuesJson: string, fieldId: string) {
  try {
    const parsed = JSON.parse(valuesJson) as unknown;
    if (!Array.isArray(parsed)) return null;
    const answer = parsed.find(
      (value) => isSubmissionAnswer(value) && value.fieldId === fieldId,
    );
    return answer && isSubmissionAnswer(answer) && isStoredSubmissionImage(answer.value)
      ? answer.value
      : null;
  } catch {
    return null;
  }
}
