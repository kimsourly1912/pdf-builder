import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { fail } from "@/features/workflows/workflow.server";
import {
  detailProgress,
  updateProgress,
} from "@/features/candidate-progress/progress.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, c: Context) {
  return workflowResponse(async () => ({
    candidate: await detailProgress(
      await requireRequestOwner(request),
      (await c.params).id,
    ),
  }));
}
export async function PATCH(request: Request, c: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      fail("Use the same site to update candidate progress.", 403);
    return updateProgress(
      owner,
      (await c.params).id,
      await workflowBody(request),
    );
  });
}
