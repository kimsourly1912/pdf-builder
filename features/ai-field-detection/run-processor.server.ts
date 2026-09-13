import "server-only";

import { and, eq, inArray, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import { aiFieldDetectionRuns } from "@/db/schema";
import {
  FieldDetectionProviderError,
  detectPdfFieldsWithOpenAi,
} from "@/features/ai-field-detection/openai-field-detection.server";
import { AI_FIELD_DETECTION_MAX_ATTEMPTS } from "@/features/ai-field-detection/run-types";
import { getFilesBucket } from "@/features/templates/template.server";

export class AiFieldDetectionProcessingError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AiFieldDetectionProcessingError";
    this.retryable = retryable;
  }
}

export async function processAiFieldDetectionRun(options: {
  runId: string;
  attemptNumber: number;
}): Promise<void> {
  const { runId, attemptNumber } = options;
  const db = getDb();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [claimed] = await db
    .update(aiFieldDetectionRuns)
    .set({
      status: "processing",
      attemptCount: attemptNumber,
      startedAt: now,
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiFieldDetectionRuns.id, runId),
        or(
          inArray(aiFieldDetectionRuns.status, ["queued", "failed"]),
          and(
            eq(aiFieldDetectionRuns.status, "processing"),
            lt(aiFieldDetectionRuns.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();

  if (!claimed) return;

  try {
    const source = await getFilesBucket().get(claimed.fileKey);
    if (!source) {
      throw new AiFieldDetectionProcessingError(
        "The private source PDF is missing.",
        false,
      );
    }
    const bytes = new Uint8Array(
      await new Response(source.body).arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    const detection = await detectPdfFieldsWithOpenAi({
      bytes,
      fileName: claimed.fileName,
      pageCount: claimed.pageCount,
    });
    const completedAt = new Date().toISOString();
    await db
      .update(aiFieldDetectionRuns)
      .set({
        status: "ready_for_review",
        resultJson: JSON.stringify(detection),
        providerResponseId: detection.providerResponseId ?? null,
        inputTokens: detection.usage?.inputTokens ?? null,
        outputTokens: detection.usage?.outputTokens ?? null,
        totalTokens: detection.usage?.totalTokens ?? null,
        errorCode: null,
        errorMessage: null,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(aiFieldDetectionRuns.id, runId));
  } catch (error) {
    const failure = processingFailure(error);
    const retryable =
      failure.retryable && attemptNumber < AI_FIELD_DETECTION_MAX_ATTEMPTS;
    const failedAt = new Date().toISOString();
    await db
      .update(aiFieldDetectionRuns)
      .set({
        status: retryable ? "queued" : "failed",
        errorCode: failure.code,
        errorMessage: failure.publicMessage,
        completedAt: retryable ? null : failedAt,
        updatedAt: failedAt,
      })
      .where(eq(aiFieldDetectionRuns.id, runId));
    if (!retryable) {
      await getFilesBucket().delete(claimed.fileKey).catch((cleanupError) => {
        console.error("Failed to delete terminal AI source PDF", cleanupError);
      });
    }
    throw new AiFieldDetectionProcessingError(failure.logMessage, retryable);
  }
}

function processingFailure(error: unknown): {
  code: string;
  publicMessage: string;
  logMessage: string;
  retryable: boolean;
} {
  if (error instanceof AiFieldDetectionProcessingError) {
    return {
      code: error.retryable ? "processing_failed" : "source_unavailable",
      publicMessage: error.retryable
        ? "The PDF could not be analyzed. Try again."
        : "The uploaded PDF is no longer available. Start a new analysis.",
      logMessage: error.message,
      retryable: error.retryable,
    };
  }
  if (error instanceof FieldDetectionProviderError) {
    return {
      code: error.status === 429 ? "provider_rate_limited" : "provider_failed",
      publicMessage: error.publicMessage,
      logMessage: error.message,
      retryable: error.status === 429 || error.status >= 500,
    };
  }
  return {
    code: "processing_failed",
    publicMessage: "The PDF could not be analyzed. Try again.",
    logMessage: error instanceof Error ? error.message : "Unknown processing error",
    retryable: true,
  };
}
