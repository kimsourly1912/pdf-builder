import { formResponse } from "@/features/forms/form.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import { reviewDetail, reviewSubmission } from "@/features/hr/review.server";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return formResponse(async () =>
    Response.json(
      {
        review: await reviewDetail(
          await requireRequestOwner(request),
          (await context.params).id,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    ),
  );
}
export function POST(request: Request, context: Context) {
  return formResponse(async () =>
    reviewSubmission(request, (await context.params).id),
  );
}
