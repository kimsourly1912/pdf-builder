import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import { savePipeline } from "@/features/hiring/hiring.server";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return savePipeline(
      owner,
      (await context.params).id,
      await hiringBody(request),
    );
  });
}
