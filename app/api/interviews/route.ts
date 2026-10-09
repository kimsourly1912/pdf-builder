import { requireRequestOwner } from "@/features/templates/template.server";
import { listInterviews } from "@/features/interviews/interviews.server";
import { interviewResponse } from "@/features/interviews/api.server";
export async function GET(request: Request) {
  return interviewResponse(async () =>
    listInterviews(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
  );
}
