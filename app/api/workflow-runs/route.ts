import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowBody, workflowResponse } from "@/features/workflows/api.server";
import { listRuns, startWorkflow } from "@/features/workflows/workflow.server";
import { processWorkflowRun } from "@/features/workflows/runner.server";
export async function GET(request: Request) { return workflowResponse(async () => listRuns(await requireRequestOwner(request), new URL(request.url).searchParams)); }
export async function POST(request: Request) { return workflowResponse(async () => { const owner = await requireRequestOwner(request); const body = await workflowBody(request); const id = await startWorkflow(owner, String(body.workflowId ?? ""), String(body.resumeId ?? "")); await processWorkflowRun(id); return { runId: id }; }); }
