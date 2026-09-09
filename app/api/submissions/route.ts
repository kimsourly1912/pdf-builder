import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { isStoredSubmissionImage } from "@/features/templates/file-validation";
import { parseSubmissionFilters } from "@/features/templates/submission-filters";
import { queryOwnedSubmissions } from "@/features/templates/submission-query.server";

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const parsed = parseSubmissionFilters(new URL(request.url).searchParams);
    if (!parsed.filters) return jsonError(parsed.error, 400);
    const result = await queryOwnedSubmissions(ownerEmail, parsed.filters, 500);

    return Response.json({
      total: result.total,
      submissions: result.rows.map((row) => {
        const answers = row.answers.map(
          (answer) => ({
            ...answer,
            value: isStoredSubmissionImage(answer.value)
              ? {
                  kind: "submission-image",
                  url: `/api/submissions/${row.id}/images/${answer.fieldId}`,
                  width: answer.value.width,
                  height: answer.value.height,
                  size: answer.value.size,
                }
              : answer.value,
          }),
        );
        return {
          id: row.id,
          templateId: row.templateId,
          templateName: row.templateName,
          templateVersionId: row.templateVersionId,
          versionNumber: row.versionNumber,
          roleId: row.roleId,
          roleName: row.roleName,
          roleColor: row.roleColor,
          recipientName: row.recipientName,
          recipientEmail: row.recipientEmail,
          submittedAt: row.submittedAt,
          answers,
          values: Object.fromEntries(answers.map((answer) => [answer.label, answer.value])),
          hasCompletedPdf: Boolean(row.completedFileKey),
        };
      }),
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list submissions", error);
    return jsonError("Submissions could not be loaded.", 500);
  }
}
