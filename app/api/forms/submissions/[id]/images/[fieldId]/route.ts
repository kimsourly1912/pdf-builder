import { responseImage } from "@/features/forms/submission.server";
import { formResponse } from "@/features/forms/form.server";
export function GET(
  request: Request,
  context: { params: Promise<{ id: string; fieldId: string }> },
) {
  return formResponse(async () => {
    const { id, fieldId } = await context.params;
    return responseImage(request, id, fieldId);
  });
}
