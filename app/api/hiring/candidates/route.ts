import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringResponse } from "@/features/hiring/api.server";
import { applicationCandidates } from "@/features/hiring/hiring.server";
export async function GET(request: Request) {
  return hiringResponse(async () => ({
    items: await applicationCandidates(
      await requireRequestOwner(request),
      new URL(request.url).searchParams.get("search") ?? "",
      new URL(request.url).searchParams.get("candidate") ?? "",
    ),
  }));
}
