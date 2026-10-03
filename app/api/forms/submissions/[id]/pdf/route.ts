import { GET as downloadSubmission } from "@/app/api/submissions/[id]/pdf/route";
import { renderSubmissionPdf } from "@/features/forms/submission.server";
import { formResponse } from "@/features/forms/form.server";
import { requireRequestOwner } from "@/features/templates/template.server";
export const GET = downloadSubmission;
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return formResponse(async () => {
    const status = await renderSubmissionPdf(
      (await context.params).id,
      await requireRequestOwner(request),
      new URL(request.url).origin,
    );
    return Response.json({ status });
  });
}
