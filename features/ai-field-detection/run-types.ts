import type { FieldDetectionResult } from "@/features/ai-field-detection/field-detection";

export const AI_FIELD_DETECTION_MAX_FILE_SIZE = 12 * 1024 * 1024;
export const AI_FIELD_DETECTION_MAX_PAGE_COUNT = 20;
export const AI_FIELD_DETECTION_PROMPT_VERSION = "2026-09-13.v1";
export const AI_FIELD_DETECTION_MAX_ATTEMPTS = 3;

export type AiFieldDetectionRunStatus =
  | "queued"
  | "processing"
  | "ready_for_review"
  | "reviewed"
  | "failed"
  | "cancelled";

export type AiFieldDetectionRun = {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  status: AiFieldDetectionRunStatus;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: number;
  attemptCount: number;
  errorMessage: string | null;
  detection: FieldDetectionResult | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type AiFieldDetectionQueueMessage = {
  runId: string;
};
