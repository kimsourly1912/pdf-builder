import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import {
  applicationPreparation,
  startApplicationPreparation,
} from "@/features/hiring/preparation.server";
import { processWorkflowRun } from "@/features/workflows/runner.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return hiringResponse(async () =>
    applicationPreparation(
      await requireRequestOwner(request),
      (await context.params).id,
    ),
  );
}
export async function POST(request: Request, context: Context) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request),
      id = (await context.params).id;
    const result = await startApplicationPreparation(
      owner,
      id,
      await hiringBody(request),
    );
    await processWorkflowRun(result.runId);
    return result;
  });
}
