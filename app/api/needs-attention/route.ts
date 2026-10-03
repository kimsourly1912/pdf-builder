import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
import { listAttention } from "@/features/hr/attention.server";
export async function GET(request: Request) {
  return workflowResponse(async () =>
    listAttention(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
  );
}
