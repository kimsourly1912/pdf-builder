import "server-only";

import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { aiFieldDetectionRuns } from "@/db/schema";
import type { FieldDetectionResult } from "@/features/ai-field-detection/field-detection";
import type { DetectedFieldCandidate } from "@/features/ai-field-detection/field-detection";
import type {
  AiFieldDetectionQueueMessage,
  AiFieldDetectionRun,
  AiFieldDetectionRunStatus,
} from "@/features/ai-field-detection/run-types";

type AiFieldDetectionQueue = {
  send(message: AiFieldDetectionQueueMessage): Promise<unknown>;
};

export function getAiFieldDetectionQueue(): AiFieldDetectionQueue {
  const runtime = env as unknown as {
    AI_FIELD_DETECTION_QUEUE?: AiFieldDetectionQueue;
  };
  if (!runtime.AI_FIELD_DETECTION_QUEUE) {
    throw new Error(
      "Cloudflare Queue binding `AI_FIELD_DETECTION_QUEUE` is unavailable.",
    );
  }
  return runtime.AI_FIELD_DETECTION_QUEUE;
}

export async function findAiFieldDetectionRunForOwner(
  id: string,
  ownerEmail: string,
) {
  const [run] = await getDb()
    .select()
    .from(aiFieldDetectionRuns)
    .where(
      and(
        eq(aiFieldDetectionRuns.id, id),
        eq(aiFieldDetectionRuns.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  return run ?? null;
}

export function publicAiFieldDetectionRun(
  run: typeof aiFieldDetectionRuns.$inferSelect,
): AiFieldDetectionRun {
  const detection = parseStoredDetection(run.resultJson);
  const reviewedCandidates = parseStoredReviewedCandidates(
    run.reviewedCandidatesJson,
  );
  return {
    id: run.id,
    fileName: run.fileName,
    fileSize: run.fileSize,
    pageCount: run.pageCount,
    status: run.status as AiFieldDetectionRunStatus,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    schemaVersion: run.schemaVersion,
    attemptCount: run.attemptCount,
    errorMessage: run.errorMessage,
    detection:
      detection && reviewedCandidates
        ? { ...detection, candidates: reviewedCandidates }
        : detection,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    reviewedAt: run.reviewedAt,
    updatedAt: run.updatedAt,
  };
}

export function parseStoredDetection(value: string | null): FieldDetectionResult | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FieldDetectionResult;
    return parsed?.schemaVersion === 1 && Array.isArray(parsed.candidates)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function parseStoredReviewedCandidates(
  value: string | null,
): DetectedFieldCandidate[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as DetectedFieldCandidate[]) : null;
  } catch {
    return null;
  }
}
