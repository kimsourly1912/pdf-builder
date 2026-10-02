import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
import { listProgress } from "@/features/candidate-progress/progress.server";
export async function GET(request: Request) {
  return workflowResponse(async () =>
    listProgress(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
  );
}
