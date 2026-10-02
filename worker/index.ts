import { processTelegramUpdates } from "../features/telegram/intake.server";
import handler from "vinext/server/app-router-entry";

import {
  AiFieldDetectionProcessingError,
  processAiFieldDetectionRun,
} from "../features/ai-field-detection/run-processor.server";
import type { AiFieldDetectionQueueMessage } from "../features/ai-field-detection/run-types";
import {
  requestDurationMs,
  requestPathForLog,
  requestWithId,
  resolveRequestId,
  responseWithRequestId,
} from "../features/reliability/request-id";
import { processStorageCleanupJobs } from "../features/storage/storage-cleanup.server";
import { processPendingWorkflowRuns } from "../features/workflows/runner.server";

type QueueMessage = {
  body: unknown;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

type QueueBatch = {
  messages: readonly QueueMessage[];
};

const worker = {
  async fetch(
    request: Request,
    environment: Parameters<typeof handler.fetch>[1],
    context: Parameters<typeof handler.fetch>[2],
  ): Promise<Response> {
    const startedAt = performance.now();
    const requestId = resolveRequestId(request.headers);
    const path = requestPathForLog(request.url);
    try {
      const response = await handler.fetch(
        requestWithId(request, requestId),
        environment,
        context,
      );
      if (path === "/api/telegram/webhook" && response.ok && context) {
        context.waitUntil(processTelegramUpdates().catch(() => console.error("Telegram inbox processing unavailable")));
      }
      const durationMs = requestDurationMs(startedAt);
      console.info("Request completed", {
        requestId,
        method: request.method,
        path,
        status: response.status,
        durationMs,
      });
      return responseWithRequestId(response, requestId, durationMs);
    } catch (error) {
      const durationMs = requestDurationMs(startedAt);
      console.error("Unhandled request failure", {
        requestId,
        method: request.method,
        path,
        status: 500,
        durationMs,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return responseWithRequestId(
        Response.json(
          { error: "The request could not be completed.", requestId },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        ),
        requestId,
        durationMs,
      );
    }
  },
  async queue(batch: QueueBatch): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as Partial<AiFieldDetectionQueueMessage> | null;
      if (!body || typeof body.runId !== "string" || !body.runId) {
        console.error("Ignoring invalid AI field detection queue message");
        message.ack();
        continue;
      }
      try {
        await processAiFieldDetectionRun({
          runId: body.runId,
          attemptNumber: message.attempts,
        });
        message.ack();
      } catch (error) {
        console.error("AI field detection queue processing failed", error);
        if (
          error instanceof AiFieldDetectionProcessingError &&
          error.retryable
        ) {
          message.retry({ delaySeconds: Math.min(60, 5 * message.attempts) });
        } else {
          message.ack();
        }
      }
    }
  },
  async scheduled(): Promise<void> {
    await processTelegramUpdates();
    await processPendingWorkflowRuns();
    const result = await processStorageCleanupJobs({ limit: 100 });
    if (result.failed > 0) {
      console.warn("Storage cleanup remains pending", {
        deleted: result.deleted,
        failed: result.failed,
      });
    }
  },
};

export default worker;
