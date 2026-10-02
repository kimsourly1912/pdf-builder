import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramIntakes } from "@/features/telegram/schema";
import { analyzeResumeForOwner } from "@/features/resumes/analyze-resume.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { fail } from "@/features/workflows/workflow.server";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      id = (await context.params).id,
      body = await workflowBody(request);
    if (body.confirm !== true)
      fail("Confirm that this action uses paid AI processing.", 422);
    const now = new Date().toISOString(),
      token = crypto.randomUUID();
    const [intake] = await getDb()
      .select()
      .from(telegramIntakes)
      .where(
        and(eq(telegramIntakes.id, id), eq(telegramIntakes.ownerEmail, owner)),
      )
      .limit(1);
    if (!intake) fail("Candidate intake not found.", 404);
    if (intake.extractionStatus === "extracted" && body.reextract !== true)
      return { reused: true };
    const [claimed] = await getDb()
      .update(telegramIntakes)
      .set({
        extractionStatus: "processing",
        extractionToken: token,
        extractionUntil: new Date(Date.now() + 600000).toISOString(),
      })
      .where(
        and(
          eq(telegramIntakes.id, id),
          eq(telegramIntakes.ownerEmail, owner),
          or(
            isNull(telegramIntakes.extractionUntil),
            lt(telegramIntakes.extractionUntil, now),
          ),
        ),
      )
      .returning();
    if (!claimed)
      fail("AI extraction is already processing. Reload its status.", 409);
    try {
      const response = await analyzeResumeForOwner(
        request,
        owner,
        intake.resumeId,
        { intakeToken: token },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        fail(
          payload.error ?? "AI extraction could not be completed.",
          response.status,
        );
      return payload;
    } finally {
      await getDb()
        .update(telegramIntakes)
        .set({
          extractionStatus: "failed",
          extractionToken: null,
          extractionUntil: null,
        })
        .where(
          and(
            eq(telegramIntakes.id, id),
            eq(telegramIntakes.extractionToken, token),
          ),
        );
    }
  });
}
