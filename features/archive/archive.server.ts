import "server-only";
import { getDatabaseBinding, type DatabaseStatement } from "@/db";
import { fail } from "@/features/workflows/workflow.server";
import { processStorageCleanupJobs } from "@/features/storage/storage-cleanup.server";
import { ARCHIVE_TYPES, type ArchiveType, isArchiveType } from "./archive";

type Row = {
  id: string;
  label: string;
  file_key?: string;
  resume_id?: string;
  status?: string;
  banned?: number;
  ban_reason?: string;
  active?: number;
  archived_at?: string;
  verification_status?: string;
  [key: string]: unknown;
};
export type ArchivedRecord = {
  id: string;
  owner_email: string;
  entity_type: ArchiveType;
  entity_id: string;
  label: string;
  group_id: string;
  prior_state_json: string;
  archived_by: string;
  archived_at: string;
};
const RECORD_QUERIES: Record<ArchiveType, string> = {
  resume: "SELECT *,file_name label FROM resumes WHERE id=? AND owner_email=?",
  intake:
    "SELECT i.*,r.file_name label,r.verification_status FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id WHERE i.id=? AND i.owner_email=?",
  account:
    "SELECT u.*,u.name label FROM user u JOIN recipient_profiles p ON p.user_id=u.id WHERE u.id=? AND p.created_by_email=?",
  template: "SELECT *,name label FROM templates WHERE id=? AND owner_email=?",
  workflow: "SELECT *,name label FROM workflows WHERE id=? AND owner_email=?",
  workflow_run:
    "SELECT *,workflow_name label FROM workflow_runs WHERE id=? AND owner_email=?",
  submission:
    "SELECT s.*,t.name||' — '||s.recipient_name label FROM submissions s JOIN templates t ON t.id=s.template_id WHERE s.id=? AND t.owner_email=?",
  ai_run:
    "SELECT *,file_name label FROM ai_field_detection_runs WHERE id=? AND owner_email=?",
  hiring_application:
    "SELECT a.*,c.full_name||' — '||coalesce(j.title,'Inbox') label FROM hiring_applications a JOIN candidates c ON c.id=a.candidate_id AND c.owner_email=a.owner_email LEFT JOIN hiring_jobs j ON j.id=a.job_id WHERE a.id=? AND a.owner_email=?",
  hiring_pipeline:
    "SELECT *,name label FROM hiring_pipelines WHERE id=? AND owner_email=?",
};
export async function ownedArchiveEntity(
  owner: string,
  type: ArchiveType,
  id: string,
) {
  return getDatabaseBinding()
    .prepare(RECORD_QUERIES[type])
    .bind(id, owner)
    .first<Row>();
}
export async function isArchived(type: ArchiveType, id: string) {
  return !!(await getDatabaseBinding()
    .prepare(
      "SELECT id FROM archive_records WHERE entity_type=? AND entity_id=?",
    )
    .bind(type, id)
    .first());
}
function auditStatement(
  owner: string,
  type: ArchiveType,
  id: string,
  action: string,
  now: string,
) {
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,'owner',?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      owner,
      owner,
      `record.${action}`,
      type,
      id,
      "{}",
      now,
    );
}

// Also used in the bot's guarded storage transaction for an explicitly requested replacement.
async function archivePlan(
  owner: string,
  type: ArchiveType,
  id: string,
  now = new Date().toISOString(),
) {
  const db = getDatabaseBinding(),
    row = await ownedArchiveEntity(owner, type, id);
  if (!row) fail("Record not found.", 404);
  if (type === "hiring_pipeline" && row.is_default)
    fail("Choose another default pipeline before archiving or deleting this one.", 409);
  if (type === "ai_run" && row.status === "processing")
    fail("Wait for the running analysis to finish before archiving it.", 409);
  if (type === "intake" || type === "resume") {
    const cvId = type === "resume" ? id : String(row.resume_id);
    const extracting = await db
      .prepare(
        "SELECT id FROM telegram_intakes WHERE resume_id=? AND extraction_status='processing' AND extraction_until>?",
      )
      .bind(cvId, now)
      .first();
    if (extracting)
      fail(
        "Wait for the current AI extraction to finish before archiving this CV.",
        409,
      );
  }
  const existing = await db
    .prepare(
      "SELECT id FROM archive_records WHERE entity_type=? AND entity_id=? AND owner_email=?",
    )
    .bind(type, id, owner)
    .first();
  if (existing)
    return { statements: [], records: (await archivedGroup(owner, type, id)).members };
  const group = crypto.randomUUID(),
    members: { type: ArchiveType; row: Row }[] = [{ type, row }];
  if (type === "intake") {
    const cv = await ownedArchiveEntity(owner, "resume", String(row.resume_id));
    if (cv && !(await isArchived("resume", cv.id)))
      members.push({ type: "resume", row: cv });
  } else if (type === "resume") {
    const related = await db
      .prepare(
        "SELECT i.*,r.file_name label FROM telegram_intakes i JOIN resumes r ON r.id=i.resume_id WHERE i.resume_id=? AND i.owner_email=?",
      )
      .bind(id, owner)
      .all<Row>();
    for (const intake of related.results ?? [])
      if (!(await isArchived("intake", intake.id)))
        members.push({ type: "intake", row: intake });
  }
  const statements: DatabaseStatement[] = [], records: ArchivedRecord[] = [];
  if (type === "hiring_application" || type === "hiring_pipeline") {
    const guardId = crypto.randomUUID();
    const table = type === "hiring_application" ? "hiring_applications" : "hiring_pipelines";
    statements.push(db.prepare(`INSERT INTO hiring_guards(id,check_passed) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM ${table} WHERE id=? AND owner_email=? AND revision=?${type === "hiring_pipeline" ? " AND is_default=0" : ""}) THEN 1 ELSE 0 END`).bind(guardId, id, owner, row.revision));
    statements.push(db.prepare("DELETE FROM hiring_guards WHERE id=?").bind(guardId));
  }
  for (const member of members) {
    const r = member.row,
      t = member.type;
    const record: ArchivedRecord = {
      id: crypto.randomUUID(), owner_email: owner, entity_type: t,
      entity_id: r.id, label: String(r.label), group_id: group,
      prior_state_json: JSON.stringify({
        banned: r.banned ?? 0, banReason: r.ban_reason ?? null,
        banExpires: r.ban_expires ?? null, hold: r.hold ?? null,
      }),
      archived_by: owner, archived_at: now,
    };
    records.push(record);
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO archive_records(id,owner_email,entity_type,entity_id,label,group_id,prior_state_json,archived_by,archived_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          record.id,
          owner,
          t,
          r.id,
          String(r.label),
          group,
          record.prior_state_json,
          owner,
          now,
        ),
    );
    if (t === "template")
      statements.push(
        db
          .prepare(
            "UPDATE templates SET archived_at=?,updated_at=? WHERE id=? AND owner_email=?",
          )
          .bind(now, now, r.id, owner),
      );
    if (t === "template")
      statements.push(
        db
          .prepare(
            "UPDATE recipient_links SET status='revoked',revoked_at=?,updated_at=? WHERE template_id=? AND assigned_user_id IS NULL",
          )
          .bind(now, now, r.id),
      );
    if (t === "workflow")
      statements.push(
        db
          .prepare(
            "UPDATE workflows SET active=0,updated_at=? WHERE id=? AND owner_email=?",
          )
          .bind(now, r.id, owner),
      );
    if (t === "hiring_pipeline")
      statements.push(db.prepare("UPDATE hiring_pipelines SET archived=1,revision=revision+1,updated_at=? WHERE id=? AND owner_email=? AND is_default=0").bind(now, r.id, owner));
    if (t === "hiring_application") {
      statements.push(db.prepare("UPDATE hiring_applications SET hold='Archived by HR',revision=revision+1,updated_at=? WHERE id=? AND owner_email=?").bind(now, r.id, owner));
      statements.push(db.prepare("UPDATE hiring_events SET status='cancelled' WHERE application_id=? AND owner_email=? AND status='pending'").bind(r.id, owner));
      statements.push(db.prepare("UPDATE workflow_runs SET status='failed',error_message='This application is archived. Restore it, then retry.',lock_token=NULL,locked_until=NULL,updated_at=? WHERE application_id=? AND owner_email=? AND status IN ('queued','running','waiting_review')").bind(now, r.id, owner));
    }
    if (t === "account") {
      statements.push(
        db
          .prepare(
            "UPDATE user SET banned=1,ban_reason='Archived by HR',ban_expires=NULL WHERE id=?",
          )
          .bind(r.id),
      );
      statements.push(
        db.prepare("DELETE FROM session WHERE user_id=?").bind(r.id),
      );
    }
    if (t === "resume")
      statements.push(
        db
          .prepare(
            "UPDATE workflow_runs SET status='failed',error_message='This CV is archived. Restore it, then retry this run.',lock_token=NULL,locked_until=NULL,updated_at=? WHERE resume_id=? AND owner_email=? AND status IN ('queued','running','waiting_review')",
          )
          .bind(now, r.id, owner),
      );
    if (t === "workflow_run")
      statements.push(
        db
          .prepare(
            "UPDATE workflow_runs SET status='failed',error_message='This run is archived. Restore it, then retry.',lock_token=NULL,locked_until=NULL,updated_at=? WHERE id=? AND owner_email=? AND status IN ('queued','running','waiting_review')",
          )
          .bind(now, r.id, owner),
      );
    if (t === "ai_run")
      statements.push(
        db
          .prepare(
            "UPDATE ai_field_detection_runs SET status='cancelled',updated_at=? WHERE id=? AND owner_email=? AND status IN ('queued','failed')",
          )
          .bind(now, r.id, owner),
      );
    statements.push(auditStatement(owner, t, r.id, "archived", now));
  }
  return { statements, records };
}
export async function archiveStatements(owner: string, type: ArchiveType, id: string, now = new Date().toISOString()) {
  return (await archivePlan(owner, type, id, now)).statements;
}
export async function archiveEntity(
  owner: string,
  type: ArchiveType,
  id: string,
) {
  const source = await ownedArchiveEntity(owner, type, id);
  const cvId =
    type === "resume"
      ? id
      : type === "intake"
        ? String(source?.resume_id ?? "")
        : null;
  const activeRun = cvId
    ? await getDatabaseBinding()
        .prepare(
          "SELECT id FROM workflow_runs WHERE resume_id=? AND owner_email=? AND status IN ('queued','running','waiting_review') LIMIT 1",
        )
        .bind(cvId, owner)
        .first()
    : null;
  const statements = await archiveStatements(owner, type, id);
  if (statements.length) {
    try {
      await getDatabaseBinding().batch(statements);
    } catch (error) {
      if (type === "hiring_application" || type === "hiring_pipeline")
        fail("This hiring record changed. Refresh before archiving it.", 409);
      throw error;
    }
  }
  const record = await getDatabaseBinding()
    .prepare(
      "SELECT archived_at FROM archive_records WHERE owner_email=? AND entity_type=? AND entity_id=?",
    )
    .bind(owner, type, id)
    .first<{ archived_at: string }>();
  return {
    archived: true,
    archivedAt: record?.archived_at ?? null,
    undoable:
      ["template", "submission"].includes(type) || (!!cvId && !activeRun),
  };
}
export async function archivedGroup(
  owner: string,
  type: ArchiveType,
  id: string,
) {
  const db = getDatabaseBinding(),
    record = await db
      .prepare(
        "SELECT * FROM archive_records WHERE owner_email=? AND entity_type=? AND entity_id=?",
      )
      .bind(owner, type, id)
      .first<ArchivedRecord>();
  if (!record) fail("Archive record not found.", 404);
  const rows = await db
    .prepare(
      "SELECT * FROM archive_records WHERE owner_email=? AND group_id=? ORDER BY entity_type",
    )
    .bind(owner, record.group_id)
    .all<ArchivedRecord>();
  return { record, members: rows.results ?? [] };
}
export async function archiveList(owner: string, query: URLSearchParams) {
  const db = getDatabaseBinding(),
    page = Math.max(
      1,
      Math.min(100000, Math.floor(Number(query.get("page")) || 1)),
    ),
    type = query.get("type"),
    search = `%${(query.get("search") ?? "").slice(0, 120).replace(/[\\%_]/gu, "\\$&")}%`;
  const filter =
      "owner_email=? AND label LIKE ? ESCAPE '\\'" +
      (type && isArchiveType(type) ? " AND entity_type=?" : ""),
    args = [owner, search, ...(type && isArchiveType(type) ? [type] : [])];
  const result = await db
    .prepare(
      `SELECT ar.* FROM archive_records ar WHERE ar.owner_email=? AND ar.id=(SELECT g.id FROM archive_records g WHERE g.owner_email=ar.owner_email AND g.group_id=ar.group_id ORDER BY CASE WHEN g.entity_type='intake' THEN 0 ELSE 1 END,g.id LIMIT 1) AND ar.group_id IN (SELECT group_id FROM archive_records WHERE ${filter}) ORDER BY archived_at DESC,id DESC LIMIT 50 OFFSET ?`,
    )
    .bind(owner, ...args, (page - 1) * 50)
    .all<ArchivedRecord>();
  const total = await db
    .prepare(
      `SELECT count(DISTINCT group_id) total FROM archive_records WHERE ${filter}`,
    )
    .bind(...args)
    .first<{ total: number }>();
  const pageRecords = result.results ?? [],
    groupIds = pageRecords.map((r) => r.group_id);
  const cases = ARCHIVE_TYPES.map((type) => {
    const rule = deletionRule(type);
    return rule.query
      ? `WHEN ar.entity_type='${type}' AND EXISTS(${rule.query.replaceAll("?", "ar.entity_id")}) THEN '${rule.reason.replaceAll("'", "''")}'`
      : "";
  }).join(" ");
  const members = groupIds.length
    ? ((
        await db
          .prepare(
            `SELECT ar.*,CASE ${cases} ELSE NULL END protection_reason FROM archive_records ar WHERE ar.owner_email=? AND ar.group_id IN (${groupIds.map(() => "?").join(",")}) ORDER BY ar.entity_type`,
          )
          .bind(owner, ...groupIds)
          .all<ArchivedRecord & { protection_reason: string | null }>()
      ).results ?? [])
    : [];
  const items = pageRecords.map((record) => {
    const group = members.filter((m) => m.group_id === record.group_id),
      reasons = group.flatMap((m) =>
        m.protection_reason ? [m.protection_reason] : [],
      );
    return {
      ...record,
      related_count: group.length,
      members: group.map((m) => ({
        id: m.id,
        entity_type: m.entity_type,
        entity_id: m.entity_id,
        label: m.label,
      })),
      canDelete: reasons.length === 0,
      protectionReasons: reasons,
    };
  });
  return {
    items,
    total: total?.total ?? 0,
    page,
    pageSize: 50,
  };
}
function transition(record: ArchivedRecord, action: string) {
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO archive_transition_guards(owner_email,entity_type,entity_id,archived_at,action) VALUES(?,?,?,?,?)",
    )
    .bind(
      record.owner_email,
      record.entity_type,
      record.entity_id,
      record.archived_at,
      action,
    );
}
export async function restoreEntity(
  owner: string,
  type: ArchiveType,
  id: string,
  expected: string,
) {
  const { record, members } = await archivedGroup(owner, type, id);
  if (record.archived_at !== expected)
    fail("The archive changed. Refresh before restoring.", 409);
  const db = getDatabaseBinding(),
    now = new Date().toISOString(),
    statements = members.map((r) => transition(r, "restore"));
  for (const r of members) {
    if (r.entity_type === "hiring_pipeline")
      statements.push(db.prepare("UPDATE hiring_pipelines SET archived=0,revision=revision+1,updated_at=? WHERE id=? AND owner_email=?").bind(now, r.entity_id, owner));
    if (r.entity_type === "hiring_application") {
      const prior = JSON.parse(r.prior_state_json) as { hold?: string | null };
      statements.push(db.prepare("UPDATE hiring_applications SET hold=?,revision=revision+1,updated_at=? WHERE id=? AND owner_email=?").bind(prior.hold ?? null, now, r.entity_id, owner));
    }
    if (r.entity_type === "template")
      statements.push(
        db
          .prepare(
            "UPDATE templates SET archived_at=NULL,updated_at=? WHERE id=? AND owner_email=?",
          )
          .bind(now, r.entity_id, owner),
      );
    if (r.entity_type === "account") {
      const prior = JSON.parse(r.prior_state_json) as {
        banned?: number;
        banReason?: string | null;
        banExpires?: number | null;
      };
      statements.push(
        db
          .prepare(
            "UPDATE user SET banned=?,ban_reason=?,ban_expires=? WHERE id=? AND ban_reason='Archived by HR'",
          )
          .bind(
            prior.banned ?? 0,
            prior.banReason ?? null,
            prior.banExpires ?? null,
            r.entity_id,
          ),
      );
    }
    statements.push(
      db
        .prepare("DELETE FROM archive_records WHERE id=? AND owner_email=?")
        .bind(r.id, owner),
    );
    statements.push(
      auditStatement(owner, r.entity_type, r.entity_id, "restored", now),
    );
  }
  try {
    await db.batch(statements);
  } catch {
    fail("The archive changed. Refresh before restoring.", 409);
  }
  return { restored: true };
}
function deletionRule(type: ArchiveType) {
  let query: string | null = null,
    reason =
      "Linked records must be preserved. Resolve their links before permanent deletion.";
  if (type === "submission")
    return {
      query: "SELECT 1",
      reason:
        "Completed submissions are protected evidence. They can be archived and restored, but cannot be permanently deleted.",
    };
  if (type === "template") {
    query =
      "SELECT id FROM form_assignments WHERE template_id=? UNION ALL SELECT id FROM submissions WHERE template_id=? LIMIT 1";
    reason =
      "This template has assignments or submitted forms. Their history must be preserved.";
  }
  if (type === "account") {
    query =
      "SELECT id FROM form_assignments WHERE user_id=? UNION ALL SELECT id FROM recipient_links WHERE assigned_user_id=? UNION ALL SELECT id FROM candidates WHERE user_id=? UNION ALL SELECT id FROM interview_processes WHERE account_id=? LIMIT 1";
    reason =
      "This account has candidate links, assigned forms or interview history. Preserve their history; unlink an unused candidate before deleting an unused account.";
  }
  if (type === "workflow") {
    query = "SELECT id FROM workflow_runs WHERE workflow_id=? LIMIT 1";
    reason =
      "This workflow has run history. Archive or remove eligible runs first.";
  }
  if (type === "workflow_run") {
    query =
      "SELECT id FROM workflow_runs WHERE id=? AND (json_extract(context_json,'$.userId') IS NOT NULL OR EXISTS(SELECT 1 FROM hiring_preparations hp WHERE hp.run_id=workflow_runs.id)) UNION ALL SELECT id FROM telegram_deliveries WHERE run_id=? UNION ALL SELECT id FROM interview_processes WHERE run_id=? UNION ALL SELECT id FROM hiring_applications WHERE json_extract(evidence_json,'$.runId')=? LIMIT 1";
    reason =
      "This run created or linked an account, or has Telegram delivery history. It must remain as preparation/interview evidence.";
  }
  if (type === "resume") {
    query =
      "SELECT id FROM workflow_runs WHERE resume_id=? AND (status IN ('queued','running','waiting_review') OR EXISTS(SELECT 1 FROM hiring_preparations hp WHERE hp.run_id=workflow_runs.id)) UNION ALL SELECT resume_id FROM candidate_cv_updates WHERE base_resume_id=? OR (resume_id=? AND status='accepted') UNION ALL SELECT id FROM interview_processes WHERE resume_id=? UNION ALL SELECT id FROM hiring_applications WHERE resume_id=? LIMIT 1";
    reason = "This CV is used by a hiring application, active workflow, protected CV update/approval or interview history.";
  }
  if (type === "ai_run") {
    query =
      "SELECT id FROM ai_field_detection_runs WHERE id=? AND status='processing'";
    reason = "An AI analysis is still processing.";
  }
  if (type === "hiring_application") {
    query = "SELECT 1 WHERE EXISTS(SELECT 1 FROM hiring_events WHERE application_id=? AND kind<>'application_received') OR EXISTS(SELECT 1 FROM workflow_runs WHERE application_id=?) OR EXISTS(SELECT 1 FROM hiring_preparations WHERE application_id=?) OR EXISTS(SELECT 1 FROM hiring_application_forms WHERE application_id=?) OR EXISTS(SELECT 1 FROM form_assignments WHERE application_id=?) OR EXISTS(SELECT 1 FROM interview_processes WHERE application_id=?) OR EXISTS(SELECT 1 FROM hiring_applications WHERE id=? AND (interview_id IS NOT NULL OR outcome IS NOT NULL OR offer<>'none' OR json_remove(evidence_json,'$.preparationMode','$.preparationModeSource')<>'{}'))";
    reason = "This application has hiring progress, preparation, forms or interview history. Archive it to preserve that evidence.";
  }
  if (type === "hiring_pipeline") {
    query = "SELECT 1 WHERE EXISTS(SELECT 1 FROM hiring_pipelines WHERE id=? AND is_default=1) OR EXISTS(SELECT 1 FROM hiring_jobs j JOIN hiring_pipeline_versions v ON v.id=j.pipeline_version_id WHERE v.pipeline_id=?) OR EXISTS(SELECT 1 FROM hiring_applications a JOIN hiring_pipeline_versions v ON v.id=a.pipeline_version_id WHERE v.pipeline_id=?) OR EXISTS(SELECT 1 FROM workflows w JOIN hiring_pipeline_versions v ON instr(w.draft_json,v.id)>0 OR instr(coalesce(w.published_json,''),v.id)>0 WHERE v.pipeline_id=?) OR EXISTS(SELECT 1 FROM workflow_versions w JOIN hiring_pipeline_versions v ON instr(w.graph_json,v.id)>0 WHERE v.pipeline_id=?)";
    reason = "This pipeline is the default inbox or is used by jobs, applications or workflow versions. Choose another default or archive it to preserve linked history.";
  }
  return { query, reason };
}
export async function deletionBlocker(
  owner: string,
  type: ArchiveType,
  id: string,
): Promise<string | null> {
  const db = getDatabaseBinding(),
    { query, reason } = deletionRule(type);
  if (!query) return null;
  const n = (query.match(/\?/gu) ?? []).length;
  return (await db
    .prepare(query)
    .bind(...Array(n).fill(id))
    .first())
    ? reason
    : null;
}
export async function deleteArchivedEntity(
  owner: string,
  type: ArchiveType,
  id: string,
  expected: string,
) {
  const { record, members } = await archivedGroup(owner, type, id);
  if (record.archived_at !== expected)
    fail("The archive changed. Refresh before deleting.", 409);
  return executeDeletion(owner, members);
}
async function executeDeletion(owner: string, members: ArchivedRecord[], prefix: DatabaseStatement[] = []) {
  const db = getDatabaseBinding(),
    now = new Date().toISOString();
  for (const r of members) {
    const reason = await deletionBlocker(owner, r.entity_type, r.entity_id);
    if (reason) fail(reason, 409);
  }
  const statements = [...prefix, ...members.map((r) => transition(r, "delete"))],
    keys: string[] = [];
  for (const r of [...members].sort(
    (a, b) =>
      (a.entity_type === "intake" ? -1 : 0) -
      (b.entity_type === "intake" ? -1 : 0),
  )) {
    const source = await ownedArchiveEntity(owner, r.entity_type, r.entity_id);
    if (source?.file_key) keys.push(source.file_key);
    if (r.entity_type === "template") {
      const versions = await db
        .prepare("SELECT file_key FROM template_versions WHERE template_id=?")
        .bind(r.entity_id)
        .all<{ file_key: string }>();
      keys.push(...(versions.results ?? []).map((v) => v.file_key));
      statements.push(
        db
          .prepare("DELETE FROM recipient_links WHERE template_id=?")
          .bind(r.entity_id),
      );
    }
    if (r.entity_type === "workflow_run")
      statements.push(
        db
          .prepare("DELETE FROM workflow_review_decisions WHERE run_id=?")
          .bind(r.entity_id),
      );
    if (r.entity_type === "hiring_pipeline")
      statements.push(db.prepare("DELETE FROM hiring_pipeline_versions WHERE pipeline_id=? AND owner_email=?").bind(r.entity_id, owner));
    if (r.entity_type === "hiring_application")
      statements.push(db.prepare("INSERT INTO hiring_guards(id,check_passed) VALUES(?,1)").bind(`delete-application:${r.entity_id}`));
    const table = {
      intake: "telegram_intakes",
      resume: "resumes",
      account: "user",
      template: "templates",
      workflow: "workflows",
      workflow_run: "workflow_runs",
      submission: "submissions",
      ai_run: "ai_field_detection_runs",
      hiring_application: "hiring_applications",
      hiring_pipeline: "hiring_pipelines",
    }[r.entity_type];
    statements.push(
      db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(r.entity_id),
    );
    if (r.entity_type === "hiring_application")
      statements.push(db.prepare("DELETE FROM hiring_guards WHERE id=?").bind(`delete-application:${r.entity_id}`));
    statements.push(
      db
        .prepare("DELETE FROM archive_records WHERE id=? AND owner_email=?")
        .bind(r.id, owner),
    );
    statements.push(
      auditStatement(
        owner,
        r.entity_type,
        r.entity_id,
        "deleted_permanently",
        now,
      ),
    );
  }
  for (const key of new Set(keys))
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO storage_cleanup_jobs(id,object_key,reason,attempt_count,created_at,updated_at) VALUES(?,?,'archive_deleted',0,?,?)",
        )
        .bind(crypto.randomUUID(), key, now, now),
    );
  try {
    await db.batch(statements);
  } catch {
    fail(
      "Permanent deletion is blocked because the archive changed or linked history must be preserved.",
      409,
    );
  }
  await processStorageCleanupJobs({ objectKeys: keys }).catch(() => undefined);
  return { deleted: true };
}

async function deletionSnapshot(owner: string, type: ArchiveType, id: string) {
  const plan = await archivePlan(owner, type, id);
  const members = await Promise.all(plan.records.map(async (record) => ({
    type: record.entity_type, id: record.entity_id,
    row: await ownedArchiveEntity(owner, record.entity_type, record.entity_id),
    archive: await getDatabaseBinding().prepare("SELECT * FROM archive_records WHERE entity_type=? AND entity_id=? AND owner_email=?").bind(record.entity_type, record.entity_id, owner).first<ArchivedRecord>(),
    reason: await deletionBlocker(owner, record.entity_type, record.entity_id),
  })));
  const sorted = [...members].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(sorted)));
  const state = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  return { plan, members, state };
}
export async function previewDeletion(owner: string, type: ArchiveType, id: string) {
  const snapshot = await deletionSnapshot(owner, type, id);
  return {
    state: snapshot.state,
    members: snapshot.members.map((m) => ({ type: m.type, id: m.id, label: m.row?.label, reason: m.reason })),
  };
}
// Archive and delete in one batch: failures leave active records and files untouched.
export async function deleteEntity(owner: string, type: ArchiveType, id: string, expectedState: string) {
  const snapshot = await deletionSnapshot(owner, type, id);
  if (snapshot.state !== expectedState) fail("This record or its linked history changed. Close this dialog and review deletion again.", 409);
  const db = getDatabaseBinding(), guards: DatabaseStatement[] = [], cleanup: DatabaseStatement[] = [];
  for (const member of snapshot.members) {
    if (member.reason) fail(member.reason, 409);
    if (!member.row) fail("Record not found.", 404);
    const fields = Object.entries(member.row);
    // Column names come only from the fixed server queries above, never client input.
    const guardId = crypto.randomUUID();
    guards.push(db.prepare(`INSERT INTO hiring_guards(id,check_passed) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM (${RECORD_QUERIES[member.type]}) WHERE ${fields.map(([key]) => `"${key.replaceAll('"', '""')}" IS ?`).join(" AND ")}) THEN 1 ELSE 0 END`).bind(guardId, member.id, owner, ...fields.map(([, value]) => value)));
    cleanup.push(db.prepare("DELETE FROM hiring_guards WHERE id=?").bind(guardId));
  }
  return executeDeletion(owner, snapshot.plan.records, [...guards, ...cleanup, ...snapshot.plan.statements]);
}
