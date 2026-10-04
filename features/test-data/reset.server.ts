import "server-only";
import { env } from "cloudflare:workers";
import { getDatabaseBinding } from "@/db";
import {
  hashRecipientToken,
  jsonError,
} from "@/features/templates/template.server";
import {
  isValidStorageObjectKey,
  processStorageCleanupJobs,
} from "@/features/storage/storage-cleanup.server";
import { resetFilesSql } from "./files.server";
import {
  busySql,
  foreignReferenceSql,
  resetOwnerCte,
  resetTables,
  snapshotSql,
} from "./reset-plan.server";
import type { ResetChoice, ResetPreview, ResetResult } from "./reset";

export function testDataResetEnabled() {
  return (
    (env as unknown as { TEST_DATA_RESET_ENABLED?: string })
      .TEST_DATA_RESET_ENABLED === "true"
  );
}
function requireEnabled() {
  if (!testDataResetEnabled())
    throw jsonError("Test data reset is disabled for this deployment.", 403);
}
function isManagement(owner: string) {
  return Number(
    owner ===
      (
        env as unknown as { MANAGEMENT_EMAIL?: string }
      ).MANAGEMENT_EMAIL?.trim().toLowerCase(),
  );
}
async function inspect(owner: string, choice: ResetChoice) {
  requireEnabled();
  const db = getDatabaseBinding(),
    tables = resetTables(choice),
    snapshot = await snapshotSql(db, tables),
    foreign = await foreignReferenceSql(db, tables);
  const cte =
    resetOwnerCte +
    `, reset_snapshot AS (${snapshot}), reset_targets AS (SELECT json_extract(value,'$[0]') table_name,json_extract(value,'$[1]') row_key FROM json_each((SELECT snapshot FROM reset_snapshot))) `;
  const filesSql = `SELECT COALESCE(json_group_array(k),'[]') FROM (${resetFilesSql()} ORDER BY k)`;
  const raw = await db
    .prepare(
      cte +
        `SELECT (SELECT snapshot FROM reset_snapshot) snapshot, (${filesSql}) files_json, (${busySql()}) busy, (${foreign}) shared`,
    )
    .bind(owner, isManagement(owner))
    .first<{
      snapshot: string;
      files_json: string;
      busy: number;
      shared: number;
    }>();
  if (!raw || raw.snapshot.length + raw.files_json.length > 750000)
    throw jsonError(
      "This reset is too large for one safe transaction. Clear a smaller category first.",
      413,
    );
  const keys: string[] = JSON.parse(raw.files_json);
  if (keys.some((k) => !isValidStorageObjectKey(k)))
    throw jsonError(
      "Some stored file references are invalid. Reset refused; no records were removed.",
      409,
    );
  const records: [string, string, unknown][] = JSON.parse(raw.snapshot);
  const preview: ResetPreview = {
    revision: await hashRecipientToken(
      JSON.stringify([owner, choice, raw.snapshot, raw.files_json]),
    ),
    counts: tables
      .map((t) => ({
        table: t.table,
        label: t.label,
        count: records.filter((r) => r[0] === t.table).length,
      }))
      .filter((t) => t.count > 0),
    files: keys.length,
    blockers: [
      raw.busy
        ? "Processing is still active. Wait for CV extraction, PDF generation, automation and bot messages to finish, then refresh this preview."
        : "",
      raw.shared
        ? "Some records are linked outside this reset scope. Choose a broader reset; records belonging to another workspace will not be removed."
        : "",
    ].filter(Boolean),
  };
  return { db, tables, snapshot, foreign, raw, keys, preview, cte, filesSql };
}
export async function previewTestDataReset(owner: string, choice: ResetChoice) {
  return (await inspect(owner, choice)).preview;
}
export async function executeTestDataReset(
  owner: string,
  choice: ResetChoice,
  revision: string,
  confirmation: string,
): Promise<ResetResult> {
  requireEnabled();
  if (confirmation !== "DELETE TEST DATA")
    throw jsonError(
      "Type DELETE TEST DATA to confirm permanent deletion.",
      422,
    );
  const plan = await inspect(owner, choice);
  if (plan.preview.revision !== revision)
    throw jsonError(
      "Data changed since your preview. Review a fresh preview before deleting.",
      409,
    );
  if (plan.preview.blockers.length)
    throw jsonError(plan.preview.blockers.join(" "), 409);
  const { db, tables } = plan,
    id = crypto.randomUUID(),
    now = new Date().toISOString();
  // Keep each checked statement shallow enough for D1's expression-depth limit.
  // Every check and mutation remains in the same atomic batch.
  const statements = [
    db
      .prepare(
        resetOwnerCte +
          `, reset_snapshot AS (${plan.snapshot}) INSERT INTO test_data_reset_guards(id,owner_email,check_passed) SELECT ?,email,CASE WHEN (SELECT snapshot FROM reset_snapshot)=? THEN 1 ELSE 0 END FROM reset_owner`,
      )
      .bind(owner, isManagement(owner), id, plan.raw.snapshot),
    db
      .prepare(
        resetOwnerCte +
          `UPDATE test_data_reset_guards SET check_passed=CASE WHEN NOT (${busySql()}) AND NOT (${plan.foreign}) THEN 1 ELSE 0 END WHERE id=?`,
      )
      .bind(owner, isManagement(owner), id),
  ];
  for (const t of tables)
    statements.push(
      db
        .prepare(
          resetOwnerCte +
            `INSERT INTO test_data_reset_targets(reset_id,table_name,row_key) SELECT ?,'${t.table}',CAST(rowid AS TEXT) FROM ${t.table} WHERE ${t.where}`,
        )
        .bind(owner, isManagement(owner), id),
    );
  statements.push(
    db
      .prepare(
        `WITH reset_targets AS (SELECT table_name,row_key FROM test_data_reset_targets WHERE reset_id=?) UPDATE test_data_reset_guards SET check_passed=CASE WHEN (${plan.filesSql})=? THEN 1 ELSE 0 END WHERE id=?`,
      )
      .bind(id, plan.raw.files_json, id),
  );
  // Keys are persisted in the same transaction as record deletion, so R2 failures can retry safely.
  for (const key of plan.keys)
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO storage_cleanup_jobs(id,object_key,reason,attempt_count,created_at,updated_at) VALUES(?,?,'test_data_reset',0,?,?)",
        )
        .bind(crypto.randomUUID(), key, now, now),
    );
  for (const t of tables) {
    const selected = `CAST(rowid AS TEXT) IN (SELECT row_key FROM test_data_reset_targets WHERE reset_id=? AND table_name='${t.table}')`;
    if (t.table === "telegram_updates")
      statements.push(
        db
          .prepare(
            `UPDATE telegram_updates SET chat_id='',payload_json='{}',status='completed',lock_token=NULL,locked_until=NULL,error_message=NULL WHERE ${selected}`,
          )
          .bind(id),
      );
    else if (t.mode === "update")
      statements.push(
        db
          .prepare(
            `UPDATE candidate_progress SET primary_run_id=NULL,manual_stage=NULL,basis_json=NULL,version=version+1,updated_at=? WHERE ${selected}`,
          )
          .bind(now, id),
      );
    else
      statements.push(
        db.prepare(`DELETE FROM ${t.table} WHERE ${selected}`).bind(id),
      );
  }
  const removed = plan.preview.counts
    .filter((t) => !tables.find((s) => s.table === t.table)?.mode)
    .reduce((n, t) => n + t.count, 0);
  statements.push(
    db
      .prepare(
        "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,'owner',?,'test_data.reset','workspace',?,?,?)",
      )
      .bind(
        id,
        owner,
        owner,
        id,
        JSON.stringify({
          scope: choice.scope,
          keepDefinitions: choice.keepDefinitions,
          removed,
          filesQueued: plan.keys.length,
        }),
        now,
      ),
  );
  statements.push(
    db.prepare("DELETE FROM test_data_reset_guards WHERE id=?").bind(id),
  );
  try {
    await db.batch(statements);
  } catch {
    throw jsonError(
      "The reset could not finish. No records were deleted. Refresh the preview and try again.",
      409,
    );
  }
  let filesDeleted = 0;
  try {
    filesDeleted = (
      await processStorageCleanupJobs({
        objectKeys: plan.keys.slice(0, 90),
        limit: 90,
      })
    ).deleted;
  } catch {
    /* Durable cleanup jobs remain for the scheduled worker. */
  }
  let filesPending: number | null = null;
  try {
    const remaining = plan.keys.length
      ? await db
          .prepare(
            "SELECT COUNT(*) remaining FROM storage_cleanup_jobs WHERE object_key IN (SELECT value FROM json_each(?))",
          )
          .bind(JSON.stringify(plan.keys))
          .first<{ remaining: number }>()
      : { remaining: 0 };
    if (remaining) {
      filesPending = remaining.remaining;
      filesDeleted = Math.max(0, plan.keys.length - filesPending);
    }
  } catch {
    /* The reset committed; do not turn a cleanup progress-read failure into a failed reset. */
  }
  return {
    removed,
    filesQueued: plan.keys.length,
    filesDeleted,
    filesPending,
  };
}
