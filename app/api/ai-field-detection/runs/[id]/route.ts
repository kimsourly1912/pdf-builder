import { isArchived } from "@/features/archive/archive.server";
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { aiFieldDetectionRuns } from "@/db/schema";
import { parseReviewedFieldCandidates } from "@/features/ai-field-detection/field-detection-review";
import {
  findAiFieldDetectionRunForOwner,
  parseStoredDetection,
  parseStoredReviewedCandidates,
  publicAiFieldDetectionRun,
} from "@/features/ai-field-detection/run.server";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { compensateStorageWrites } from "@/features/storage/storage-cleanup.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const run = await findAiFieldDetectionRunForOwner(id, ownerEmail);
    if (!run) return jsonError("AI analysis not found.", 404);
    return Response.json(
      { run: publicAiFieldDetectionRun(run) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to load AI field detection", error);
    return jsonError("The AI analysis could not be loaded.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const run = await findAiFieldDetectionRunForOwner(id, ownerEmail);
    if (!run) return jsonError("AI analysis not found.", 404);
    if (await isArchived("ai_run", id))
      return jsonError(
        "Restore this analysis from Archive before reviewing it.",
        409,
      );
    if (run.status === "reviewed") {
      const acceptedCandidates = parseStoredReviewedCandidates(
        run.reviewedCandidatesJson,
      );
      if (!acceptedCandidates) {
        return jsonError("The saved AI field review is invalid.", 500);
      }
      return Response.json({
        run: publicAiFieldDetectionRun(run),
        acceptedCandidates,
      });
    }
    if (run.status !== "ready_for_review") {
      return jsonError("This AI analysis is not ready for review.", 409);
    }
    const detection = parseStoredDetection(run.resultJson);
    if (!detection) return jsonError("The AI analysis result is invalid.", 500);
    const body = (await request.json().catch(() => null)) as {
      acceptedCandidates?: unknown;
    } | null;
    const reviewedCandidates = parseReviewedFieldCandidates({
      value: body?.acceptedCandidates,
      detected: detection.candidates,
    });
    if (!reviewedCandidates) {
      return jsonError("The reviewed field selection is invalid.", 422);
    }

    const reviewedAt = new Date().toISOString();
    const [reviewed] = await getDb()
      .update(aiFieldDetectionRuns)
      .set({
        status: "reviewed",
        reviewedCandidatesJson: JSON.stringify(reviewedCandidates),
        reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(
        and(
          eq(aiFieldDetectionRuns.id, id),
          eq(aiFieldDetectionRuns.ownerEmail, ownerEmail),
          eq(aiFieldDetectionRuns.status, "ready_for_review"),
        ),
      )
      .returning();
    if (!reviewed) {
      return jsonError("This AI analysis was already reviewed.", 409);
    }
    await compensateStorageWrites([run.fileKey], "ai_finished");
    return Response.json({
      run: publicAiFieldDetectionRun(reviewed),
      acceptedCandidates: reviewedCandidates,
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to save AI field review", error);
    return jsonError("The AI field review could not be saved.", 500);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const cancelledAt = new Date().toISOString();
    const [run] = await getDb()
      .update(aiFieldDetectionRuns)
      .set({ status: "cancelled", updatedAt: cancelledAt })
      .where(
        and(
          eq(aiFieldDetectionRuns.id, id),
          eq(aiFieldDetectionRuns.ownerEmail, ownerEmail),
          inArray(aiFieldDetectionRuns.status, ["queued", "failed"]),
        ),
      )
      .returning();
    if (!run) {
      return jsonError("Only queued or failed analyses can be cancelled.", 409);
    }
    await compensateStorageWrites([run.fileKey], "ai_cancelled");
    return new Response(null, { status: 204 });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to cancel AI field detection", error);
    return jsonError("The AI analysis could not be cancelled.", 500);
  }
}
