import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import { startApplicationInterview } from "@/features/hiring/interview.server";
export async function POST(
  request: Request,
  c: { params: Promise<{ id: string }> },
) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return startApplicationInterview(
      owner,
      (await c.params).id,
      await hiringBody(request),
    );
  });
}
