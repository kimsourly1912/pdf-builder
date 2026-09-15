import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { aiFieldDetectionRuns } from "@/db/schema";
import { getFieldDetectionModel } from "@/features/ai-field-detection/openai-field-detection.server";
import {
  getAiFieldDetectionQueue,
  publicAiFieldDetectionRun,
} from "@/features/ai-field-detection/run.server";
import {
  AI_FIELD_DETECTION_MAX_FILE_SIZE,
  AI_FIELD_DETECTION_MAX_PAGE_COUNT,
  AI_FIELD_DETECTION_PROMPT_VERSION,
} from "@/features/ai-field-detection/run-types";
import { inspectPdf } from "@/features/templates/file-validation";
import {
  getFilesBucket,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { compensateStorageWrites } from "@/features/storage/storage-cleanup.server";

export async function POST(request: Request) {
  let fileKey: string | null = null;
  let runId: string | null = null;
  try {
    const ownerEmail = await requireRequestOwner(request);
    const formData = await request.formData();
    const pdf = formData.get("pdf");
    if (!(pdf instanceof File) || pdf.type !== "application/pdf") {
      return jsonError("A PDF file is required.", 400);
    }
    if (pdf.size > AI_FIELD_DETECTION_MAX_FILE_SIZE) {
      return jsonError("AI analysis supports PDFs up to 12 MB.", 413);
    }

    const bytes = new Uint8Array(
      await pdf.arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    const inspection = await inspectPdf(bytes);
    if (!inspection) {
      return jsonError("The uploaded file is not a valid PDF.", 400);
    }
    if (inspection.pageCount > AI_FIELD_DETECTION_MAX_PAGE_COUNT) {
      return jsonError(
        `AI analysis supports up to ${AI_FIELD_DETECTION_MAX_PAGE_COUNT} pages.`,
        413,
      );
    }

    runId = crypto.randomUUID();
    fileKey = `ai-field-detection/${runId}/source.pdf`;
    const now = new Date().toISOString();
    const model = getFieldDetectionModel();
    const fileName = safePdfFileName(pdf.name);
    const files = getFilesBucket();
    await files.put(fileKey, bytes.buffer, {
      httpMetadata: { contentType: "application/pdf" },
    });
    const [run] = await getDb()
      .insert(aiFieldDetectionRuns)
      .values({
        id: runId,
        ownerEmail,
        fileKey,
        fileName,
        fileSize: pdf.size,
        pageCount: inspection.pageCount,
        status: "queued",
        provider: "openai",
        model,
        promptVersion: AI_FIELD_DETECTION_PROMPT_VERSION,
        schemaVersion: 1,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await getAiFieldDetectionQueue().send({ runId });
    return Response.json(
      { run: publicAiFieldDetectionRun(run) },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to queue AI field detection", error);
    if (runId) {
      try {
        await getDb()
          .delete(aiFieldDetectionRuns)
          .where(eq(aiFieldDetectionRuns.id, runId));
      } catch {
        // The original infrastructure error is returned below.
      }
    }
    if (fileKey) {
      await compensateStorageWrites([fileKey], "ai_enqueue_failed");
    }
    return jsonError("AI analysis could not be started. Try again.", 503);
  }
}

function safePdfFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/gu, "_");
  return normalized.toLowerCase().endsWith(".pdf")
    ? normalized.slice(0, 160)
    : `${normalized.slice(0, 156) || "document"}.pdf`;
}
