import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { storageCleanupJobs } from "@/db/schema";
import { getFilesBucket } from "@/features/templates/template.server";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const OBJECT_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,1023}$/u;

export type StorageCleanupReason =
  | "ai_cancelled"
  | "ai_enqueue_failed"
  | "ai_finished"
  | "resume_create_failed"
  | "resume_deleted"
  | "submission_rolled_back"
  | "template_create_failed"
  | "template_deleted"
  | "template_update_failed";

type ProcessStorageCleanupOptions = {
  limit?: number;
  objectKeys?: string[];
};

export type StorageCleanupResult = {
  deleted: number;
  failed: number;
};

export function createStorageCleanupRows(
  objectKeys: string[],
  reason: StorageCleanupReason,
  now: string,
) {
  return [...new Set(objectKeys)]
    .filter(isValidStorageObjectKey)
    .map((objectKey) => ({
      id: crypto.randomUUID(),
      objectKey,
      reason,
      attemptCount: 0,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    }));
}

export function isValidStorageObjectKey(objectKey: string): boolean {
  return OBJECT_KEY_PATTERN.test(objectKey) && !objectKey.includes("..");
}

export async function enqueueStorageCleanup(
  objectKeys: string[],
  reason: StorageCleanupReason,
): Promise<void> {
  const rows = createStorageCleanupRows(
    objectKeys,
    reason,
    new Date().toISOString(),
  );
  if (rows.length === 0) return;
  await getDb()
    .insert(storageCleanupJobs)
    .values(rows)
    .onConflictDoNothing({ target: storageCleanupJobs.objectKey });
}

export async function enqueueAndProcessStorageCleanup(
  objectKeys: string[],
  reason: StorageCleanupReason,
): Promise<StorageCleanupResult> {
  const validKeys = [...new Set(objectKeys)].filter(isValidStorageObjectKey);
  if (validKeys.length === 0) return { deleted: 0, failed: 0 };
  await enqueueStorageCleanup(validKeys, reason);
  return processStorageCleanupJobs({ objectKeys: validKeys });
}

export async function compensateStorageWrites(
  objectKeys: string[],
  reason: StorageCleanupReason,
): Promise<void> {
  const validKeys = [...new Set(objectKeys)].filter(isValidStorageObjectKey);
  if (validKeys.length === 0) return;
  try {
    const result = await enqueueAndProcessStorageCleanup(validKeys, reason);
    if (result.failed > 0) {
      console.warn("Storage compensation remains pending", {
        reason,
        failed: result.failed,
      });
    }
  } catch {
    const results = await Promise.allSettled(
      validKeys.map((objectKey) => getFilesBucket().delete(objectKey)),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      console.error("Storage compensation could not be persisted", {
        reason,
        failed,
      });
    }
  }
}

export async function processStorageCleanupJobs(
  options: ProcessStorageCleanupOptions = {},
): Promise<StorageCleanupResult> {
  const limit = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.trunc(options.limit ?? DEFAULT_BATCH_SIZE)),
  );
  const requestedKeys = options.objectKeys
    ? [...new Set(options.objectKeys)].filter(isValidStorageObjectKey)
    : null;
  if (requestedKeys && requestedKeys.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  const db = getDb();
  const baseQuery = db
    .select()
    .from(storageCleanupJobs)
    .orderBy(asc(storageCleanupJobs.updatedAt))
    .limit(limit);
  const jobs = requestedKeys
    ? await baseQuery.where(inArray(storageCleanupJobs.objectKey, requestedKeys))
    : await baseQuery;
  let deleted = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await getFilesBucket().delete(job.objectKey);
      await db
        .delete(storageCleanupJobs)
        .where(eq(storageCleanupJobs.id, job.id));
      deleted += 1;
    } catch {
      const updatedAt = new Date().toISOString();
      await db
        .update(storageCleanupJobs)
        .set({
          attemptCount: job.attemptCount + 1,
          lastErrorCode: "R2_DELETE_FAILED",
          updatedAt,
        })
        .where(eq(storageCleanupJobs.id, job.id));
      failed += 1;
    }
  }

  return { deleted, failed };
}
