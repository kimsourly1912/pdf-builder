import { requireRequestOwner } from "@/features/templates/template.server";
import { interviewResponse } from "@/features/interviews/api.server";
import { interviewAccountPreview } from "@/features/interviews/account-preview.server";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return interviewResponse(async () => ({
    account: await interviewAccountPreview(
      await requireRequestOwner(request),
      (await context.params).id,
    ),
  }));
}
