import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import {
  publishedVersions,
  restorePublishedDraft,
} from "@/features/workflows/workflow.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return workflowResponse(async () => ({
    items: (
      await publishedVersions(
        await requireRequestOwner(request),
        (await context.params).id,
      )
    ).map((v) => ({ ...v, graph: JSON.parse(v.graph) })),
  }));
}
export async function POST(request: Request, context: Context) {
  return workflowResponse(async () => ({
    workflow: await restorePublishedDraft(
      await requireRequestOwner(request),
      (await context.params).id,
      await workflowBody(request),
    ),
  }));
}
