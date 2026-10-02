import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
import { archiveList } from "@/features/archive/archive.server";
export async function GET(request: Request) {
  return workflowResponse(async () =>
    archiveList(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
  );
}
