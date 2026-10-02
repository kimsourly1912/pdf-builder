import {
  WORKFLOW_TRIGGERS,
  type WorkflowTrigger,
} from "@/features/workflows/workflow";
import { fail } from "@/features/workflows/workflow.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import {
  createWorkflow,
  listWorkflows,
  templateOptions,
} from "@/features/workflows/workflow.server";
export async function GET(request: Request) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    return {
      items: await listWorkflows(owner),
      templates: await templateOptions(owner),
    };
  });
}
export async function POST(request: Request) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      body = await workflowBody(request),
      trigger = body.trigger ?? "staff_upload";
    if (
      typeof trigger !== "string" ||
      !WORKFLOW_TRIGGERS.includes(trigger as WorkflowTrigger)
    )
      fail("Choose a workflow starting event.", 422);
    return {
      workflow: await createWorkflow(owner, trigger as WorkflowTrigger),
    };
  });
}
