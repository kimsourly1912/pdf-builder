import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { workflowReadiness } from "@/features/workflows/readiness.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return workflowResponse(async () =>
    workflowReadiness(
      await requireRequestOwner(request),
      (await context.params).id,
    ),
  );
}
export async function POST(request: Request, context: Context) {
  return workflowResponse(async () =>
    workflowReadiness(
      await requireRequestOwner(request),
      (await context.params).id,
      (await workflowBody(request)).graph,
    ),
  );
}
