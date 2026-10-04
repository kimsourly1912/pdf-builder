import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { resumes } from "@/db/schema";
import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { fail } from "@/features/workflows/workflow.server";
import { validCandidateEmail } from "@/features/resumes/approval-plan";
import { approvalPlan } from "@/features/resumes/approval-plan.server";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      id = (await context.params).id,
      body = await workflowBody(request);
    if (typeof body.email !== "string" || !validCandidateEmail(body.email))
      fail("Enter a valid email address.", 422);
    const [resume] = await getDb()
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.ownerEmail, owner)))
      .limit(1);
    if (!resume?.candidateId) fail("Candidate CV not found.", 404);
    return {
      plan: (await approvalPlan(owner, id, resume.candidateId, body.email))
        .plan,
    };
  });
}
