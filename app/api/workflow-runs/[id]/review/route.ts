import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowBody, workflowResponse } from "@/features/workflows/api.server";
import { getReviewData, reviewRun } from "@/features/workflows/review.server";
import { processWorkflowRun } from "@/features/workflows/runner.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return workflowResponse(async () => getReviewData(await requireRequestOwner(request), (await context.params).id)); }
export async function POST(request: Request, context: Context) { return workflowResponse(async () => { const owner = await requireRequestOwner(request); const { id } = await context.params; await reviewRun(owner, id, await workflowBody(request)); await processWorkflowRun(id); return { success: true }; }); }
