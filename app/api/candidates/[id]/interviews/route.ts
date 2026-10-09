import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowBody } from "@/features/workflows/api.server";
import { handoffInterview } from "@/features/interviews/interviews.server";
import {
  interviewResponse,
  sameSiteInterview,
} from "@/features/interviews/api.server";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return interviewResponse(async () => {
    const owner = await requireRequestOwner(request);
    sameSiteInterview(request);
    return handoffInterview(
      owner,
      (await context.params).id,
      await workflowBody(request),
    );
  });
}
