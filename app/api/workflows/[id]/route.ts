import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import {
  getWorkflow,
  saveWorkflow,
  duplicateWorkflow,
} from "@/features/workflows/workflow.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return workflowResponse(async () => ({
    workflow: await getWorkflow(
      await requireRequestOwner(request),
      (await context.params).id,
    ),
  }));
}
export async function PATCH(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    return {
      workflow: await saveWorkflow(
        owner,
        (await context.params).id,
        await workflowBody(request),
      ),
    };
  });
}

export async function POST(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      body = await workflowBody(request);
    if (body.action !== "duplicate")
      throw Response.json({ error: "Choose duplicate." }, { status: 400 });
    return {
      workflow: await duplicateWorkflow(owner, (await context.params).id),
    };
  });
}
