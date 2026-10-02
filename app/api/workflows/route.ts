import {
  WORKFLOW_PRESETS,
  type WorkflowPreset,
} from "@/features/workflows/presets";
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
      preset = body.preset,
      trigger =
        preset &&
        typeof preset === "string" &&
        Object.hasOwn(WORKFLOW_PRESETS, preset)
          ? WORKFLOW_PRESETS[preset as WorkflowPreset].trigger
          : (body.trigger ?? "staff_upload");
    if (
      preset !== undefined &&
      (typeof preset !== "string" || !Object.hasOwn(WORKFLOW_PRESETS, preset))
    )
      fail("Choose a workflow purpose.", 422);
    if (
      typeof trigger !== "string" ||
      !WORKFLOW_TRIGGERS.includes(trigger as WorkflowTrigger)
    )
      fail("Choose a workflow starting event.", 422);
    return {
      workflow: await createWorkflow(
        owner,
        trigger as WorkflowTrigger,
        preset as WorkflowPreset | undefined,
      ),
    };
  });
}
