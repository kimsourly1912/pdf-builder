import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowBody } from "@/features/workflows/api.server";
import {
  detailInterview,
  mutateInterview,
} from "@/features/interviews/interviews.server";
import {
  interviewResponse,
  sameSiteInterview,
} from "@/features/interviews/api.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return interviewResponse(async () => ({
    process: await detailInterview(
      await requireRequestOwner(request),
      (await context.params).id,
    ),
  }));
}
export async function PATCH(request: Request, context: Context) {
  return interviewResponse(async () => {
    const owner = await requireRequestOwner(request);
    sameSiteInterview(request);
    return mutateInterview(
      owner,
      (await context.params).id,
      await workflowBody(request),
    );
  });
}
