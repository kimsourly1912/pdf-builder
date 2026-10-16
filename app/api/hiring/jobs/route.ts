import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import { saveJob } from "@/features/hiring/hiring.server";
export async function POST(request: Request) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return saveJob(owner, await hiringBody(request));
  });
}
