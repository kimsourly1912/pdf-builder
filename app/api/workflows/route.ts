import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
import { createWorkflow, listWorkflows, templateOptions } from "@/features/workflows/workflow.server";
export async function GET(request: Request) { return workflowResponse(async () => { const owner = await requireRequestOwner(request); return { items: await listWorkflows(owner), templates: await templateOptions(owner) }; }); }
export async function POST(request: Request) { return workflowResponse(async () => ({ workflow: await createWorkflow(await requireRequestOwner(request)) })); }
