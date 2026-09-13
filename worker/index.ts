import handler from "vinext/server/app-router-entry";

import {
  AiFieldDetectionProcessingError,
  processAiFieldDetectionRun,
} from "../features/ai-field-detection/run-processor.server";
import type { AiFieldDetectionQueueMessage } from "../features/ai-field-detection/run-types";

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
  fetch: handler.fetch,
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
};

export default worker;
