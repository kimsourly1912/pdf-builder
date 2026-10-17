import {
  attentionSql,
  failedSql,
  nextAppointmentSql,
  nextAppointmentZoneSql,
  interviewPausedSql,
  followUpSql,
} from "./work.server";
import { applicationTask } from "./tasks";
import "server-only";
import { archiveStatements, archivedGroup, restoreEntity } from "@/features/archive/archive.server";
import { z } from "zod";
import { getDatabaseBinding, type DatabaseStatement } from "@/db";
import { jsonError, isResponse } from "@/features/templates/template.server";
import {
  detailProgress,
  listProgress,
} from "@/features/candidate-progress/progress.server";
import type { WorkflowGraph, RunContext } from "@/features/workflows/workflow";
import { preparationProofSql } from "@/features/interviews/preparation-proof.server";
import {
  idSchema,
  definitionSchema,
  pipelineInputSchema,
  jobInputSchema,
  initialDefinition,
  legacyDefinition,
  REQUIREMENTS,
  type HiringApplication,
  type Pipeline,
  type PipelineVersion,
  type HiringJob,
  type Requirement,
} from "./hiring";

export function hiringFail(message: string, status = 422): never {
  throw jsonError(message, status);
}
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    hiringFail(result.error.issues[0]?.message ?? "Enter valid hiring data.");
  return result.data;
}
export const hiringId = (value: unknown) => parse(idSchema, value);
const revision = (value: unknown) => parse(z.number().int().positive(), value);
const reasonText = (value: unknown, required = false) =>
  parse(
    z
      .string()
      .trim()
      .min(required ? 3 : 0)
      .max(1000),
    value ?? "",
  );
export const nowIso = () => new Date().toISOString();
async function digest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function hiringGuard(checkSql: string, values: unknown[]) {
  const db = getDatabaseBinding(),
    id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO hiring_guards(id,check_passed) SELECT ?,CASE WHEN (${checkSql}) THEN 1 ELSE 0 END`,
      )
      .bind(id, ...values),
    db.prepare("DELETE FROM hiring_guards WHERE id=?").bind(id),
  ];
}
export async function hiringBatch(statements: DatabaseStatement[]) {
  try {
    return await getDatabaseBinding().batch(statements);
  } catch (error) {
    if (isResponse(error)) throw error;
    if (
      error instanceof Error &&
      /hiring_checked|UNIQUE constraint/u.test(error.message)
    )
      hiringFail(
        "Hiring records changed or this application already exists. Refresh and review before trying again.",
        409,
      );
    throw error;
  }
}
function audit(
  owner: string,
  action: string,
  id: string,
  details: unknown,
  at = nowIso(),
) {
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,'owner',?,?,'hiring',?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      owner,
      owner,
      `hiring.${action}`,
      id,
      JSON.stringify(details),
      at,
    );
}
type PipelineRow = {
  id: string;
  name: string;
  revision: number;
  published_version: number;
  current_version_id: string | null;
  archived: number;
  is_default: number;
  draft_json: string;
};
export async function hiringConfiguration(owner: string) {
  const db = getDatabaseBinding();
  const [p, v, j] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM hiring_pipelines WHERE owner_email=? ORDER BY is_default DESC,created_at,id",
      )
      .bind(owner)
      .all<PipelineRow>(),
    db
      .prepare(
        "SELECT v.*,p.archived FROM hiring_pipeline_versions v JOIN hiring_pipelines p ON p.id=v.pipeline_id AND p.owner_email=v.owner_email WHERE v.owner_email=? ORDER BY v.published_at DESC,v.version DESC",
      )
      .bind(owner)
      .all<{
        id: string;
        pipeline_id: string;
        name: string;
        version: number;
        definition_json: string;
        archived: number;
      }>(),
    db
      .prepare(
        "SELECT * FROM hiring_jobs WHERE owner_email=? ORDER BY title,id",
      )
      .bind(owner)
      .all<{
        id: string;
        title: string;
        pipeline_version_id: string;
        revision: number;
        archived: number;
      }>(),
  ]);
  return {
    pipelines: p.results.map(
      (p): Pipeline => ({
        id: p.id,
        name: p.name,
        revision: p.revision,
        publishedVersion: p.published_version,
        currentVersionId: p.current_version_id,
        archived: !!p.archived,
        isDefault: !!p.is_default,
        draft: parse(definitionSchema, JSON.parse(p.draft_json)),
      }),
    ),
    versions: v.results.map(
      (v): PipelineVersion => ({
        id: v.id,
        pipelineId: v.pipeline_id,
        name: v.name,
        version: v.version,
        definition: parse(definitionSchema, JSON.parse(v.definition_json)),
        archived: !!v.archived,
      }),
    ),
    jobs: j.results.map(
      (j): HiringJob => ({
        id: j.id,
        title: j.title,
        pipelineVersionId: j.pipeline_version_id,
        revision: j.revision,
        archived: !!j.archived,
      }),
    ),
  };
}
export async function createPipeline(
  owner: string,
  body: Record<string, unknown>,
) {
  const data = parse(pipelineInputSchema, {
    name: body.name ?? "New hiring pipeline",
    definition: body.definition ?? initialDefinition(),
  });
  const db = getDatabaseBinding(),
    id = crypto.randomUUID(),
    at = nowIso();
  const count = await db
    .prepare("SELECT count(*) n FROM hiring_pipelines WHERE owner_email=?")
    .bind(owner)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 50)
    hiringFail("You can keep up to 50 hiring pipelines.");
  await hiringBatch([
    db
      .prepare(
        "INSERT INTO hiring_pipelines(id,owner_email,name,draft_json,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(id, owner, data.name, JSON.stringify(data.definition), at, at),
    audit(owner, "pipeline_created", id, { name: data.name }, at),
  ]);
  return { id };
}
export async function savePipeline(
  owner: string,
  id: string,
  body: Record<string, unknown>,
) {
  hiringId(id);
  const config = await hiringConfiguration(owner),
    p = config.pipelines.find((p) => p.id === id);
  if (!p) hiringFail("Pipeline not found in your workspace.", 404);
  if (revision(body.expectedRevision) !== p.revision)
    hiringFail("This pipeline changed. Reload before saving.", 409);
  const db = getDatabaseBinding(),
    at = nowIso();
  const [guard, cleanup] = hiringGuard(
    "EXISTS(SELECT 1 FROM hiring_pipelines WHERE id=? AND owner_email=? AND revision=?)",
    [id, owner, p.revision],
  );
  const statements = [guard];
  if (body.action === "archive" || body.action === "restore") {
    if (p.isDefault && body.action === "archive")
      hiringFail("Choose another default pipeline before archiving this one.");
    if (body.action === "restore") {
      const { record } = await archivedGroup(owner, "hiring_pipeline", id);
      await restoreEntity(owner, "hiring_pipeline", id, record.archived_at);
      return hiringConfiguration(owner);
    }
    statements.push(...await archiveStatements(owner, "hiring_pipeline", id, at));
  } else if (body.action === "default") {
    if (p.archived || !p.currentVersionId)
      hiringFail(
        "Publish an active pipeline before making it the default inbox.",
      );
    if (
      config.versions.find((v) => v.id === p.currentVersionId)?.definition
        .stages[0].entry.length
    )
      hiringFail(
        "The default inbox's first stage must accept incoming CVs without entry requirements.",
      );
    statements.push(
      db
        .prepare(
          "UPDATE hiring_pipelines SET is_default=0,revision=revision+1,updated_at=? WHERE owner_email=? AND is_default=1 AND id<>?",
        )
        .bind(at, owner, id),
    );
    statements.push(
      db
        .prepare(
          "UPDATE hiring_pipelines SET is_default=1,revision=revision+1,updated_at=? WHERE id=? AND owner_email=?",
        )
        .bind(at, id, owner),
    );
  } else {
    if (p.archived) hiringFail("Restore this pipeline before editing it.");
    const data = parse(pipelineInputSchema, body),
      publishing = body.action === "publish";
    if (publishing && p.isDefault && data.definition.stages[0].entry.length)
      hiringFail(
        "The default inbox's first stage must accept incoming CVs without entry requirements.",
      );
    if (!publishing && body.action !== "save")
      hiringFail("Choose Save draft or Publish.");
    const versionId = publishing ? crypto.randomUUID() : p.currentVersionId;
    if (publishing)
      statements.push(
        db
          .prepare(
            "INSERT INTO hiring_pipeline_versions(id,pipeline_id,owner_email,name,version,definition_json,published_at) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            versionId,
            id,
            owner,
            data.name,
            p.publishedVersion + 1,
            JSON.stringify(data.definition),
            at,
          ),
      );
    statements.push(
      db
        .prepare(
          "UPDATE hiring_pipelines SET name=?,draft_json=?,revision=revision+1,published_version=?,current_version_id=?,updated_at=? WHERE id=? AND owner_email=?",
        )
        .bind(
          data.name,
          JSON.stringify(data.definition),
          p.publishedVersion + (publishing ? 1 : 0),
          versionId,
          at,
          id,
          owner,
        ),
    );
  }
  statements.push(
    audit(
      owner,
      `pipeline_${String(body.action)}`,
      id,
      { previousRevision: p.revision },
      at,
    ),
    cleanup,
  );
  await hiringBatch(statements);
  return hiringConfiguration(owner);
}
export async function saveJob(owner: string, body: Record<string, unknown>) {
  const data = parse(jobInputSchema, body),
    config = await hiringConfiguration(owner);
  const version = config.versions.find(
    (v) => v.id === data.pipelineVersionId && !v.archived,
  );
  if (!version)
    hiringFail("Choose a published, active pipeline in your workspace.");
  const id = body.id ? hiringId(body.id) : crypto.randomUUID(),
    db = getDatabaseBinding();
  if (body.id) {
    const current = config.jobs.find((j) => j.id === id);
    if (!current) hiringFail("Job not found.", 404);
    const [guard, cleanup] = hiringGuard(
      "EXISTS(SELECT 1 FROM hiring_jobs WHERE id=? AND owner_email=? AND revision=?)",
      [id, owner, revision(body.expectedRevision)],
    );
    await hiringBatch([
      guard,
      db
        .prepare(
          "UPDATE hiring_jobs SET title=?,pipeline_version_id=?,archived=?,revision=revision+1 WHERE id=? AND owner_email=?",
        )
        .bind(
          data.title,
          data.pipelineVersionId,
          body.archived === true ? 1 : 0,
          id,
          owner,
        ),
      audit(owner, "job_updated", id, data),
      cleanup,
    ]);
  } else {
    const count = await db
      .prepare("SELECT count(*) n FROM hiring_jobs WHERE owner_email=?")
      .bind(owner)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 500)
      hiringFail("You can keep up to 500 job openings.");
    await hiringBatch([
      db
        .prepare(
          "INSERT INTO hiring_jobs(id,owner_email,title,pipeline_version_id,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(id, owner, data.title, data.pipelineVersionId, nowIso()),
      audit(owner, "job_created", id, data),
    ]);
  }
  return { id };
}
export async function applicationCandidates(
  owner: string,
  search: string,
  candidateId = "",
) {
  return (
    await getDatabaseBinding()
      .prepare(
        `SELECT c.id candidateId,c.full_name name,c.email,r.id resumeId,r.file_name fileName FROM candidates c JOIN resumes r ON r.candidate_id=c.id AND r.owner_email=c.owner_email WHERE c.owner_email=? AND instr(lower(c.full_name||' '||c.email||' '||r.file_name),lower(?))>0 AND (?='' OR c.id=?) AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates u WHERE u.resume_id=r.id AND u.status NOT IN ('accepted','replaced')) AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='resume' AND x.entity_id=r.id) ORDER BY r.created_at DESC LIMIT 100`,
      )
      .bind(owner, search.slice(0, 200), candidateId, candidateId)
      .all<{
        candidateId: string;
        name: string;
        email: string;
        resumeId: string;
        fileName: string;
      }>()
  ).results;
}
const applicationSelect = `SELECT a.*,${failedSql} failed,${nextAppointmentSql} next_appointment,${nextAppointmentZoneSql} next_appointment_timezone,c.full_name name,c.email,r.file_name,j.title job_title FROM hiring_applications a JOIN candidates c ON c.id=a.candidate_id AND c.owner_email=a.owner_email JOIN resumes r ON r.id=a.resume_id AND r.owner_email=a.owner_email AND r.candidate_id=a.candidate_id LEFT JOIN hiring_jobs j ON j.id=a.job_id AND j.owner_email=a.owner_email WHERE a.owner_email=? AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='hiring_application' AND ar.entity_id=a.id)`;
type ApplicationRow = {
  failed: number;
  next_appointment: string | null;
  next_appointment_timezone: string | null;
  id: string;
  candidate_id: string;
  name: string;
  email: string;
  resume_id: string;
  file_name: string;
  job_id: string | null;
  job_title: string | null;
  pipeline_version_id: string;
  stage_id: string;
  revision: number;
  stage_entered_at: string | null;
  outcome: HiringApplication["outcome"];
  hold: string | null;
  offer: HiringApplication["offer"];
  interview_id: string | null;
  evidence_json: string;
  created_at: string;
};
function appDto(a: ApplicationRow): HiringApplication {
  return {
    id: a.id,
    nextAppointment: a.next_appointment,
    nextAppointmentTimezone: a.next_appointment_timezone,
    candidateId: a.candidate_id,
    name: a.name,
    email: a.email,
    resumeId: a.resume_id,
    fileName: a.file_name,
    jobId: a.job_id,
    jobTitle: a.job_title ?? "Unassigned job",
    pipelineVersionId: a.pipeline_version_id,
    stageId: a.stage_id,
    revision: a.revision,
    stageEnteredAt: a.stage_entered_at,
    outcome: a.outcome,
    hold: a.hold,
    offer: a.offer,
    interviewId: a.interview_id,
    evidence: JSON.parse(a.evidence_json),
    createdAt: a.created_at,
  };
}
export async function getApplication(owner: string, id: string) {
  hiringId(id);
  const row = await getDatabaseBinding()
    .prepare(applicationSelect + " AND a.id=?")
    .bind(owner, id)
    .first<ApplicationRow>();
  if (!row) hiringFail("Application not found in your workspace.", 404);
  return appDto(row);
}
export async function listApplications(owner: string, query: URLSearchParams) {
  const versionId = query.get("pipeline") || "",
    job = query.get("job") || "",
    candidate = query.get("candidate") || "";
  const search = (query.get("search") ?? "").slice(0, 200),
    closed = query.get("closed") === "true";
  const stage = query.get("stage") || "";
  const queue = query.get("queue") ?? "pipeline";
  const queueClause =
    queue === "attention"
      ? ` AND ${attentionSql}`
      : queue === "upcoming"
        ? ` AND ${nextAppointmentSql} IS NOT NULL`
        : queue === "paused"
          ? ` AND (a.hold IS NOT NULL OR ${interviewPausedSql})`
          : queue === "follow_up"
            ? ` AND ${followUpSql}`
            : "";
  const clause =
    queueClause +
    ` AND (?='' OR a.pipeline_version_id=?) AND (?='' OR a.job_id=?) AND (?='' OR a.candidate_id=?) AND instr(lower(c.full_name||' '||c.email||' '||coalesce(j.title,'')),lower(?))>0 AND ${closed ? "a.outcome IS NOT NULL" : "a.outcome IS NULL"} AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='resume' AND x.entity_id=r.id)`;
  const values = [
      owner,
      versionId,
      versionId,
      job,
      job,
      candidate,
      candidate,
      search,
    ],
    db = getDatabaseBinding();
  const stats = (
    await db
      .prepare(
        `SELECT stage_id,count(*) n FROM (${applicationSelect + clause}) GROUP BY stage_id`,
      )
      .bind(...values)
      .all<{ stage_id: string; n: number }>()
  ).results;
  const total = stage
    ? (stats.find((s) => s.stage_id === stage)?.n ?? 0)
    : stats.reduce((n, s) => n + s.n, 0);
  const page = Math.min(
    Math.max(1, Math.ceil(total / 50)),
    Math.max(1, Math.floor(Number(query.get("page")) || 1)),
  );
  const rows = (
    await db
      .prepare(
        applicationSelect +
          clause +
          ` AND (?='' OR a.stage_id=?) ORDER BY ${queue === "upcoming" ? "next_appointment ASC," : ""}a.updated_at DESC,a.id LIMIT 50 OFFSET ?`,
      )
      .bind(...values, stage, stage, (page - 1) * 50)
      .all<ApplicationRow>()
  ).results;
  const config = await hiringConfiguration(owner);
  const items = await Promise.all(
    rows.map(async (row) => {
      const app = appDto(row),
        stage = config.versions
          .find((v) => v.id === app.pipelineVersionId)
          ?.definition.stages.find((s) => s.id === app.stageId);
      const facts = await applicationFacts(owner, app);
      app.documentCounts = facts.documentCounts;
      app.nextTask = applicationTask(app, stage, facts, !!row.failed);
      return app;
    }),
  );
  return {
    items,
    total,
    page,
    pageSize: 50,
    stats: Object.fromEntries(stats.map((s) => [s.stage_id, s.n])),
  };
}
export async function applicationProof(
  owner: string,
  app: Pick<HiringApplication, "candidateId">,
) {
  const proof =
    (
      await getDatabaseBinding()
        .prepare(preparationProofSql)
        .bind(owner, app.candidateId)
        .first<{ proof: string }>()
    )?.proof ?? "";
  if (proof.length > 750000)
    hiringFail(
      "This application has too much evidence history for one safe update. Contact your administrator.",
      413,
    );
  return proof;
}
export async function applicationFacts(owner: string, app: HiringApplication) {
  const db = getDatabaseBinding();
  const cv = await db
    .prepare(
      `SELECT p.id FROM candidate_profile_versions p JOIN resumes r ON r.id=p.resume_id JOIN candidates c ON c.id=p.candidate_id WHERE r.id=? AND c.id=? AND p.owner_email=? AND r.owner_email=p.owner_email AND c.owner_email=p.owner_email AND p.created_by_email=p.owner_email AND p.verification_status='verified' AND r.verification_status='verified' AND c.verification_status='verified' AND r.duplicate_candidate_id IS NULL AND p.created_at>=r.updated_at AND p.created_at>=c.updated_at AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='resume' AND x.entity_id=r.id) ORDER BY p.version_number DESC LIMIT 1`,
    )
    .bind(app.resumeId, app.candidateId, owner)
    .first<{ id: string }>();
  const assignments = app.evidence.assignments ?? [];
  const forms = (
    await db
      .prepare(
        `SELECT f.id,f.status,f.template_id,f.template_version_id,f.role_id,f.candidate_profile_version_id,(SELECT h.status FROM submission_reviews h JOIN submissions s ON s.id=h.submission_id WHERE s.recipient_link_id=f.recipient_link_id AND h.owner_email=? AND h.reviewed_by=? ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1) review_status FROM form_assignments f JOIN user u ON u.id=f.user_id AND COALESCE(u.banned,0)=0 JOIN recipient_profiles p ON p.user_id=f.user_id JOIN candidates c ON c.user_id=f.user_id AND c.owner_email=p.created_by_email JOIN templates t ON t.id=f.template_id AND t.owner_email=p.created_by_email WHERE f.id IN (SELECT value FROM json_each(?)) AND c.id=? AND p.created_by_email=? AND t.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE (x.entity_type='account' AND x.entity_id=f.user_id) OR (x.entity_type='template' AND x.entity_id=f.template_id) OR (x.entity_type='submission' AND x.entity_id=(SELECT sub.id FROM submissions sub WHERE sub.recipient_link_id=f.recipient_link_id ORDER BY sub.submitted_at DESC,sub.id DESC LIMIT 1)))`,
      )
      .bind(owner, owner, JSON.stringify(assignments), app.candidateId, owner)
      .all<{
        id: string;
        status: string;
        review_status: string | null;
        template_id: string;
        template_version_id: string;
        role_id: string;
        candidate_profile_version_id: string | null;
      }>()
  ).results;
  const run = app.evidence.runId
    ? await db
        .prepare(
          "SELECT status,context_json,graph_json,EXISTS(SELECT 1 FROM telegram_deliveries d WHERE d.run_id=workflow_runs.id AND d.owner_email=workflow_runs.owner_email AND d.status='sent') invitation_sent FROM workflow_runs WHERE id=? AND owner_email=? AND resume_id=? AND event_id IS NULL AND NOT EXISTS(SELECT 1 FROM archive_records WHERE entity_type='workflow_run' AND entity_id=workflow_runs.id)",
        )
        .bind(app.evidence.runId, owner, app.resumeId)
        .first<{
          status: string;
          context_json: string;
          graph_json: string;
          invitation_sent: number;
        }>()
    : null;
  const selectedStage = await db
    .prepare(
      "SELECT json_extract(s.value,'$.interviewScope') scope FROM hiring_pipeline_versions v,json_each(v.definition_json,'$.stages') s WHERE v.id=? AND v.owner_email=? AND json_extract(s.value,'$.id')=?",
    )
    .bind(app.pipelineVersionId, owner, app.stageId)
    .first<{ scope: string | null }>();
  const scopedRounds = selectedStage?.scope === "stage";
  const roundScope =
    "r.process_id=p.id" + (scopedRounds ? " AND r.stage_id=?" : "");
  const interview = app.interviewId
    ? await db
        .prepare(
          `SELECT p.rounds_complete,p.outcome, (SELECT count(*) FROM interview_rounds r WHERE ${roundScope} AND r.status='completed') completed, (SELECT count(*) FROM interview_rounds r,json_each(r.interviewers_json) j WHERE ${roundScope} AND r.status='completed' AND NOT EXISTS(SELECT 1 FROM interview_feedback f WHERE f.round_id=r.id AND f.interviewer=j.value AND f.status='submitted')) missing,(SELECT count(*) FROM interview_rounds r WHERE ${roundScope} AND r.status='scheduled') scheduled FROM interview_processes p WHERE p.id=? AND p.candidate_id=? AND p.owner_email=?`,
        )
        .bind(
          ...(scopedRounds ? [app.stageId, app.stageId, app.stageId] : []),
          app.interviewId,
          app.candidateId,
          owner,
        )
        .first<{
          rounds_complete: number;
          outcome: string | null;
          completed: number;
          missing: number;
          scheduled: number;
        }>()
    : null;
  const graph = run ? (JSON.parse(run.graph_json) as WorkflowGraph) : null;
  const context = run ? (JSON.parse(run.context_json) as RunContext) : null;
  const targets =
    graph?.nodes.flatMap((n) =>
      n.kind === "assign_forms" ? (n.config.forms ?? []) : [],
    ) ?? [];
  const preparationReady =
    !!cv &&
    forms.length === assignments.length &&
    (!run ||
      (run.status === "completed" &&
        context?.profileVersionId === cv.id &&
        !context.rejection)) &&
    (run !== null || forms.length > 0) &&
    targets.every((t) =>
      forms.some(
        (f) =>
          f.template_id === t.templateId &&
          f.template_version_id === t.versionId &&
          f.role_id === t.roleId,
      ),
    ) &&
    forms.every((f) => f.candidate_profile_version_id === cv?.id) &&
    (!graph?.nodes.some((n) => n.kind === "send_telegram") ||
      !!run?.invitation_sent);
  return {
    documentCounts: {
      required: assignments.length,
      submitted: forms.filter((f) => f.status === "completed").length,
      accepted: forms.filter(
        (f) => f.status === "completed" && f.review_status === "accepted",
      ).length,
    },
    cv_approved: !!cv,
    preparation_ready: preparationReady,
    forms_submitted:
      assignments.length > 0 &&
      forms.length === assignments.length &&
      forms.every((f) => f.status === "completed"),
    forms_accepted:
      assignments.length > 0 &&
      forms.length === assignments.length &&
      forms.every(
        (f) => f.status === "completed" && f.review_status === "accepted",
      ),
    interview_complete:
      !!interview &&
      interview.completed > 0 &&
      !interview.missing &&
      !interview.scheduled,
    profileId: cv?.id ?? null,
  };
}
export async function requireEvidence(
  owner: string,
  app: HiringApplication,
  requirements: Requirement[],
) {
  const facts = await applicationFacts(owner, app),
    missing = [...new Set(requirements)].filter((r) => !facts[r]);
  if (missing.length)
    hiringFail(
      "Before moving: " +
        missing.map((r) => REQUIREMENTS[r]).join("; ") +
        ". Open this application's documents or interviews to complete the requirement.",
    );
  return facts;
}
type EventContext = {
  resumeId: string;
  fileName: string;
  outcome: HiringApplication["outcome"];
  offer: HiringApplication["offer"];
  hold: string | null;
  jobTitle: string;
  pipelineVersionId: string;
  jobId: string | null;
  stageId: string;
  fromStageId: string | null;
  applicationRevision: number;
  chain: string[];
  stageLabel?: string;
  fromStageLabel?: string;
};
export function applicationEvent(
  owner: string,
  app: HiringApplication,
  kind: string,
  from: string | null,
  reason = "",
  chain: string[] = [],
  suppressed = false,
  labels?: {
    stageLabel?: string;
    fromStageLabel?: string;
    previousCvId?: string;
    previousCvName?: string;
  },
) {
  const context: EventContext = {
    resumeId: app.resumeId,
    fileName: app.fileName,
    outcome: app.outcome,
    offer: app.offer,
    hold: app.hold,
    jobTitle: app.jobTitle,
    pipelineVersionId: app.pipelineVersionId,
    jobId: app.jobId,
    stageId: app.stageId,
    fromStageId: from,
    applicationRevision: app.revision,
    chain,
    ...labels,
  };
  return getDatabaseBinding()
    .prepare(
      "INSERT INTO hiring_events(id,application_id,owner_email,kind,from_stage,to_stage,actor,reason,context_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,json_patch(?,coalesce((SELECT json_object('source',source,'appliedPosition',applied_position) FROM resumes WHERE id=? AND owner_email=?),'{}')),?,?)",
    )
    .bind(
      crypto.randomUUID(),
      app.id,
      owner,
      kind,
      from,
      app.stageId,
      chain.length ? "automation" : owner,
      reason,
      JSON.stringify(context),
      app.resumeId,
      owner,
      suppressed ? "suppressed" : "pending",
      nowIso(),
    );
}
export async function createApplication(
  owner: string,
  body: Record<string, unknown>,
) {
  const candidateId = hiringId(body.candidateId),
    resumeId = hiringId(body.resumeId),
    mutationId = hiringId(body.mutationId),
    requestHash = await digest(body);
  const receipt = await getDatabaseBinding()
    .prepare(
      "SELECT request_hash,application_id FROM hiring_receipts WHERE id=? AND owner_email=?",
    )
    .bind(mutationId, owner)
    .first<{ request_hash: string; application_id: string }>();
  if (receipt) {
    if (receipt.request_hash !== requestHash)
      hiringFail(
        "This request identifier was already used for different data.",
        409,
      );
    return getApplication(owner, receipt.application_id);
  }
  const config = await hiringConfiguration(owner),
    job = body.jobId
      ? config.jobs.find((j) => j.id === body.jobId && !j.archived)
      : null;
  if (body.jobId && !job) hiringFail("Choose an active job in your workspace.");
  const versionId =
    job?.pipelineVersionId ??
    body.pipelineVersionId ??
    config.pipelines.find((p) => p.isDefault && !p.archived)?.currentVersionId;
  const version = config.versions.find(
    (v) => v.id === versionId && !v.archived,
  );
  if (!version)
    hiringFail(
      "Publish a pipeline and choose it before adding an application.",
    );
  const db = getDatabaseBinding(),
    cv = await db
      .prepare(
        "SELECT r.file_name,c.full_name,c.email FROM resumes r JOIN candidates c ON c.id=r.candidate_id AND c.owner_email=r.owner_email WHERE r.id=? AND c.id=? AND r.owner_email=? AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates u WHERE u.resume_id=r.id AND u.status NOT IN ('accepted','replaced')) AND NOT EXISTS(SELECT 1 FROM archive_records WHERE entity_type='resume' AND entity_id=r.id)",
      )
      .bind(resumeId, candidateId, owner)
      .first<{ file_name: string; full_name: string; email: string }>();
  if (!cv)
    hiringFail(
      "Choose an active CV linked to this candidate in your workspace.",
    );
  const at = nowIso(),
    app: HiringApplication = {
      id: crypto.randomUUID(),
      candidateId,
      resumeId,
      name: cv.full_name,
      email: cv.email,
      fileName: cv.file_name,
      jobId: job?.id ?? null,
      jobTitle: job?.title ?? "Unassigned job",
      pipelineVersionId: version.id,
      stageId: version.definition.stages[0].id,
      revision: 1,
      stageEnteredAt: at,
      outcome: null,
      hold: null,
      offer: "none",
      interviewId: null,
      evidence: {
        preparationMode: version.definition.preparationMode ?? "legacy",
        preparationModeSource: "pipeline",
      },
      createdAt: at,
    };
  const proof = await applicationProof(owner, app);
  await requireEvidence(owner, app, version.definition.stages[0].entry);
  const [guard, cleanup] = hiringGuard(
    `(SELECT proof FROM (${preparationProofSql}))=? AND EXISTS(SELECT 1 FROM hiring_pipeline_versions v JOIN hiring_pipelines p ON p.id=v.pipeline_id WHERE v.id=? AND v.owner_email=? AND p.archived=0)` +
      (job
        ? " AND EXISTS(SELECT 1 FROM hiring_jobs WHERE id=? AND owner_email=? AND revision=? AND archived=0)"
        : ""),
    [
      owner,
      candidateId,
      proof,
      version.id,
      owner,
      ...(job ? [job.id, owner, job.revision] : []),
    ],
  );
  await hiringBatch([
    guard,
    db
      .prepare(
        "INSERT INTO hiring_applications(id,owner_email,candidate_id,resume_id,job_id,pipeline_version_id,stage_id,stage_entered_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        app.id,
        owner,
        candidateId,
        resumeId,
        app.jobId,
        version.id,
        app.stageId,
        at,
        at,
        at,
      ),
    applicationEvent(owner, app, "application_received", null, "", [], false, {
      stageLabel: version.definition.stages[0].name,
    }),
    db
      .prepare(
        "INSERT INTO hiring_receipts(id,owner_email,request_hash,application_id) VALUES(?,?,?,?)",
      )
      .bind(mutationId, owner, requestHash, app.id),
    audit(owner, "application_created", app.id, {
      candidateId,
      jobId: app.jobId,
    }),
    cleanup,
  ]);
  return app;
}

export type AutomationGuard = {
  runId: string;
  token: string;
  chain: string[];
  workflowId: string;
};
export async function mutateApplication(
  owner: string,
  id: string,
  body: Record<string, unknown>,
  automation?: AutomationGuard,
) {
  const mutationId = hiringId(body.mutationId),
    requestHash = await digest(body),
    db = getDatabaseBinding();
  const prior = await db
    .prepare(
      "SELECT request_hash,application_id FROM hiring_receipts WHERE id=? AND owner_email=?",
    )
    .bind(mutationId, owner)
    .first<{ request_hash: string; application_id: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash || prior.application_id !== id)
      hiringFail(
        "This request identifier was already used for different data.",
        409,
      );
    return getApplication(owner, id);
  }
  const app = await getApplication(owner, id),
    config = await hiringConfiguration(owner),
    version = config.versions.find((v) => v.id === app.pipelineVersionId);
  if (!version)
    hiringFail("The application's published pipeline is unavailable.", 409);
  if (revision(body.expectedRevision) !== app.revision)
    hiringFail("This application changed. Refresh before continuing.", 409);
  const oldStage = version.definition.stages.find((s) => s.id === app.stageId)!;
  const proof = await applicationProof(owner, app),
    reason = reasonText(body.reason),
    next = { ...app, revision: app.revision + 1 };
  let kind = "",
    from: string | null = null;
  if (body.action === "move") {
    if (app.outcome || app.hold)
      hiringFail("Reopen or resume this application before moving it.", 409);
    const target = version.definition.stages.find((s) => s.id === body.stageId);
    if (!target)
      hiringFail("Choose a stage from this application's published pipeline.");
    if (target.id === app.stageId) return app;
    if (automation && body.fromStageId !== app.stageId)
      hiringFail(
        "The automatic move's expected source stage no longer matches.",
        409,
      );
    if (
      !automation &&
      version.definition.stages.indexOf(target) <
        version.definition.stages.indexOf(oldStage)
    )
      reasonText(body.reason, true);
    await requireEvidence(owner, app, oldStage.exit);
    await requireEvidence(owner, { ...app, stageId: target.id }, target.entry);
    next.stageId = target.id;
    next.stageEnteredAt = nowIso();
    from = app.stageId;
    kind = "stage_entered";
  } else if (body.action === "assign_job") {
    if (app.outcome || app.hold)
      hiringFail("Reopen or resume before assigning a job.");
    const job = config.jobs.find((j) => j.id === body.jobId && !j.archived),
      target = config.versions.find(
        (v) => v.id === job?.pipelineVersionId && !v.archived,
      );
    if (!job || !target)
      hiringFail("Choose an active job and published pipeline.");
    if (
      app.jobId &&
      app.jobId !== job.id &&
      (app.interviewId ||
        app.offer !== "none" ||
        app.evidence.runId ||
        app.evidence.assignments?.length)
    )
      hiringFail(
        "This application already has preparation, interviews or an offer for another job. Create a separate application for the new job.",
      );
    const targetStage = target.definition.stages.find(
      (s) => s.id === body.stageId,
    );
    if (!targetStage)
      hiringFail(
        "Map this application to a stage in the job's published pipeline.",
      );
    if (app.jobId) reasonText(body.reason, true);
    await requireEvidence(owner, app, oldStage.exit);
    await requireEvidence(
      owner,
      { ...app, pipelineVersionId: target.id, stageId: targetStage.id },
      targetStage.entry,
    );
    if (
      !app.evidence.runId &&
      !app.evidence.assignments?.length &&
      app.evidence.preparationModeSource !== "owner"
    )
      next.evidence = {
        ...app.evidence,
        preparationMode: target.definition.preparationMode ?? "legacy",
        preparationModeSource: "pipeline",
      };
    next.jobId = job.id;
    next.jobTitle = job.title;
    next.pipelineVersionId = target.id;
    next.stageId = targetStage.id;
    next.stageEnteredAt = nowIso();
    from = app.stageId;
    kind = "job_assigned";
  } else if (body.action === "change_cv") {
    if (app.outcome || app.hold)
      hiringFail("Reopen or resume before selecting another CV.");
    const resumeId = hiringId(body.resumeId);
    const cv = await db
      .prepare(
        "SELECT r.file_name FROM resumes r WHERE r.id=? AND r.candidate_id=? AND r.owner_email=? AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='resume' AND x.entity_id=r.id) AND NOT EXISTS(SELECT 1 FROM candidate_cv_updates u WHERE u.resume_id=r.id AND u.status NOT IN ('accepted','replaced'))",
      )
      .bind(resumeId, app.candidateId, owner)
      .first<{ file_name: string }>();
    if (!cv) hiringFail("Choose an active CV accepted for this candidate.");
    await requireEvidence(owner, { ...app, resumeId }, ["cv_approved"]);
    if (body.confirmReuse !== true)
      hiringFail(
        "Confirm that existing forms and interview context keep their original snapshots.",
      );
    reasonText(body.reason, true);
    next.resumeId = resumeId;
    next.fileName = cv.file_name;
    kind = "application_cv_selected";
  } else if (body.action === "hold") {
    if (app.outcome)
      hiringFail("Reopen this application before putting it on hold.");
    next.hold = reasonText(body.reason, true);
    kind = "application_held";
  } else if (body.action === "resume") {
    if (!app.hold || app.outcome)
      hiringFail("Only an active application on hold can be resumed.");
    reasonText(body.reason, true);
    next.hold = null;
    kind = "application_resumed";
  } else if (body.action === "close") {
    if (app.nextAppointment)
      hiringFail(
        "Cancel or complete the scheduled interview appointment before closing this application. Open Interviews to resolve it.",
        409,
      );
    if (app.outcome) hiringFail("This application is already closed.");
    next.outcome = parse(
      z.enum(["hired", "rejected", "withdrawn"]),
      body.outcome,
    );
    reasonText(body.reason, true);
    if (next.outcome === "hired") {
      if (app.offer !== "accepted")
        hiringFail(
          "Record the candidate's accepted offer before marking Hired.",
        );
      await requireEvidence(owner, app, oldStage.exit);
    }
    next.hold = null;
    kind = "application_closed";
  } else if (body.action === "reopen") {
    if (!app.outcome) hiringFail("This application is already active.");
    reasonText(body.reason, true);
    next.outcome = null;
    kind = "application_reopened";
  } else if (body.action === "offer") {
    if (app.outcome || app.hold)
      hiringFail("Reopen or resume before updating an offer.");
    if (oldStage.activity !== "offer")
      hiringFail("Move to an offer stage before recording offer progress.");
    next.offer = parse(
      z.enum(["none", "draft", "sent", "accepted", "declined"]),
      body.offer,
    );
    reasonText(body.reason, true);
    kind = "offer_recorded";
  } else if (body.action === "preparation_mode") {
    if (app.hold || app.outcome)
      hiringFail("Resume or reopen before changing preparation automation.");
    if (body.mode !== "application" && body.mode !== "legacy")
      hiringFail("Choose application or legacy preparation.");
    if (body.confirmCutover !== true)
      hiringFail(
        "Confirm the effect on future CV-approval preparation for this CV.",
      );
    reasonText(body.reason, true);
    const active = await db
      .prepare(
        "SELECT id FROM workflow_runs WHERE owner_email=? AND resume_id=? AND event_id IS NULL AND status IN ('queued','running','waiting_review') AND (graph_json LIKE '%assign_forms%' OR graph_json LIKE '%create_account%') LIMIT 1",
      )
      .bind(owner, app.resumeId)
      .first();
    if (active)
      hiringFail(
        "Finish or resolve active preparation before changing its automation ownership.",
        409,
      );
    next.evidence = {
      ...app.evidence,
      preparationMode: body.mode,
      preparationModeSource: "owner",
    };
    kind = "preparation_mode_changed";
  } else if (body.action === "link_preparation") {
    if (app.outcome || app.hold)
      hiringFail("Reopen or resume before linking preparation.");
    const current = await detailProgress(owner, app.candidateId);
    if (
      current.revision !== body.preparationRevision ||
      current.selectedCv.id !== app.resumeId
    )
      hiringFail(
        "The candidate preparation changed or uses a different CV. Review it before linking.",
        409,
      );
    if (
      current.facts.runStatus !== "completed" ||
      !current.facts.preparationCurrent ||
      current.facts.assigned !== current.facts.required ||
      (current.facts.invitationRequired && !current.facts.invitationSent)
    )
      hiringFail("Complete preparation for this CV before linking it.");
    if (body.confirmReuse !== true)
      hiringFail(
        "Confirm that this application should use these existing form assignments.",
      );
    next.evidence = {
      preparationMode: "legacy",
      runId: current.run?.id,
      assignments: current.forms
        .filter((f) => f.isRequired !== false)
        .map((f) => f.id),
    };
    reasonText(body.reason, true);
    kind = "preparation_linked";
  } else hiringFail("Choose a supported application action.");
  if (
    automation &&
    (automation.chain.includes(automation.workflowId) ||
      automation.chain.length >= 12)
  )
    hiringFail("Automation loop stopped. Review the stage routing rules.", 409);
  const [guard, cleanup] = hiringGuard(
    `EXISTS(SELECT 1 FROM hiring_applications WHERE id=? AND owner_email=? AND revision=?) AND (SELECT proof FROM (${preparationProofSql}))=?` +
      (body.action === "assign_job"
        ? " AND EXISTS(SELECT 1 FROM hiring_jobs j JOIN hiring_pipeline_versions v ON v.id=j.pipeline_version_id JOIN hiring_pipelines p ON p.id=v.pipeline_id WHERE j.id=? AND j.owner_email=? AND j.revision=? AND j.archived=0 AND p.archived=0)"
        : "") +
      (automation
        ? " AND EXISTS(SELECT 1 FROM workflow_runs WHERE id=? AND owner_email=? AND lock_token=? AND locked_until>?)"
        : ""),
    [
      id,
      owner,
      app.revision,
      owner,
      app.candidateId,
      proof,
      ...(body.action === "assign_job"
        ? [
            next.jobId,
            owner,
            config.jobs.find((j) => j.id === next.jobId)!.revision,
          ]
        : []),
      ...(automation
        ? [automation.runId, owner, automation.token, nowIso()]
        : []),
    ],
  );
  const chain = automation ? [...automation.chain, automation.workflowId] : [];
  const targetVersion = config.versions.find(
    (v) => v.id === next.pipelineVersionId,
  )!;
  await hiringBatch([
    guard,
    db
      .prepare(
        "UPDATE hiring_applications SET resume_id=?,job_id=?,pipeline_version_id=?,stage_id=?,revision=?,stage_entered_at=?,outcome=?,hold=?,offer=?,evidence_json=?,updated_at=? WHERE id=? AND owner_email=?",
      )
      .bind(
        next.resumeId,
        next.jobId,
        next.pipelineVersionId,
        next.stageId,
        next.revision,
        next.stageEnteredAt,
        next.outcome,
        next.hold,
        next.offer,
        JSON.stringify(next.evidence),
        nowIso(),
        id,
        owner,
      ),
    ...(body.action === "link_preparation"
      ? (next.evidence.assignments ?? []).map((assignmentId) =>
          db
            .prepare(
              "INSERT OR IGNORE INTO hiring_application_forms(id,application_id,assignment_id,provenance,created_at) VALUES(?,?,?,'confirmed_reuse',?)",
            )
            .bind(crypto.randomUUID(), id, assignmentId, nowIso()),
        )
      : []),
    applicationEvent(owner, next, kind, from, reason, chain, false, {
      ...(body.action === "change_cv"
        ? { previousCvId: app.resumeId, previousCvName: app.fileName }
        : {}),
      stageLabel: targetVersion.definition.stages.find(
        (s) => s.id === next.stageId,
      )?.name,
      fromStageLabel: oldStage.name,
    }),
    db
      .prepare(
        "INSERT INTO hiring_receipts(id,owner_email,request_hash,application_id) VALUES(?,?,?,?)",
      )
      .bind(mutationId, owner, requestHash, id),
    audit(owner, kind, id, {
      from,
      to: next.stageId,
      reason,
      outcome: next.outcome,
      offer: next.offer,
      workflowId: automation?.workflowId ?? null,
    }),
    cleanup,
  ]);
  return next;
}
export async function applicationDetail(owner: string, id: string) {
  const application = await getApplication(owner, id),
    db = getDatabaseBinding();
  const events = (
    await db
      .prepare(
        "SELECT * FROM hiring_events WHERE application_id=? AND owner_email=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
      )
      .bind(id, owner)
      .all<{
        id: string;
        kind: string;
        from_stage: string | null;
        to_stage: string;
        actor: string;
        reason: string;
        created_at: string;
        status: string;
        context_json: string;
      }>()
  ).results;
  const executions = (
    await db
      .prepare(
        "SELECT id,workflow_id workflowId,workflow_name name,status,error_message error,created_at createdAt,EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow_run' AND x.entity_id=workflow_runs.id) archived FROM workflow_runs WHERE application_id=? AND owner_email=? ORDER BY created_at DESC LIMIT 20",
      )
      .bind(id, owner)
      .all<{
        id: string;
        workflowId: string;
        name: string;
        status: string;
        archived: number;
        error: string | null;
        createdAt: string;
      }>()
  ).results;
  return {
    application,
    facts: await applicationFacts(owner, application),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      from: e.from_stage,
      to: e.to_stage,
      actor: e.actor,
      reason: e.reason,
      at: e.created_at,
      status: e.status,
      labels: JSON.parse(e.context_json),
    })),
    executions,
  };
}
export async function legacyPreview(owner: string) {
  const existing = (
    await getDatabaseBinding()
      .prepare(
        "SELECT candidate_id FROM hiring_applications WHERE owner_email=? AND intake=1",
      )
      .bind(owner)
      .all<{ candidate_id: string }>()
  ).results;
  const ids = new Set(existing.map((r) => r.candidate_id));
  let page = 1;
  for (;;) {
    const result = await listProgress(
      owner,
      new URLSearchParams({ page: String(page) }),
    );
    const pending = result.items.filter((p) => !ids.has(p.id));
    if (pending.length || page * result.pageSize >= result.total)
      return {
        items: pending.map((p) => ({
          candidateId: p.id,
          name: p.name,
          stage: p.stage,
          expectedRevision: p.revision,
        })),
        total: result.total,
      };
    page++;
  }
}
export async function importLegacy(
  owner: string,
  body: Record<string, unknown>,
) {
  const items = parse(
      z
        .array(
          z.object({
            candidateId: idSchema,
            expectedRevision: z.string().min(1).max(100000),
          }),
        )
        .min(1)
        .max(20),
      body.items,
    ),
    config = await hiringConfiguration(owner);
  let pipeline = config.pipelines.find(
    (p) => p.name === "Legacy preparation" && !p.archived,
  );
  if (!pipeline) {
    const created = await createPipeline(owner, {
      name: "Legacy preparation",
      definition: legacyDefinition(),
    });
    await savePipeline(owner, created.id, {
      action: "publish",
      expectedRevision: 1,
      name: "Legacy preparation",
      definition: legacyDefinition(),
    });
    pipeline = (await hiringConfiguration(owner)).pipelines.find(
      (p) => p.id === created.id,
    )!;
  }
  const db = getDatabaseBinding();
  let imported = 0;
  for (const item of items) {
    const prior = await db
      .prepare(
        "SELECT id FROM hiring_applications WHERE candidate_id=? AND owner_email=? AND intake=1",
      )
      .bind(item.candidateId, owner)
      .first();
    if (prior) continue;
    const current = await detailProgress(owner, item.candidateId);
    if (current.revision !== item.expectedRevision)
      hiringFail("A candidate changed. Preview the import again.", 409);
    const proof = await applicationProof(owner, {
        candidateId: item.candidateId,
      }),
      at = nowIso(),
      id = crypto.randomUUID();
    const [guard, cleanup] = hiringGuard(
      `(SELECT proof FROM (${preparationProofSql}))=?`,
      [owner, item.candidateId, proof],
    );
    await hiringBatch([
      guard,
      db
        .prepare(
          "INSERT INTO hiring_applications(id,owner_email,candidate_id,resume_id,pipeline_version_id,stage_id,intake,evidence_json,interview_id,outcome,stage_entered_at,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?)",
        )
        .bind(
          id,
          owner,
          item.candidateId,
          current.selectedCv.id,
          pipeline.currentVersionId,
          current.interview ? "interviews" : current.stage,
          JSON.stringify({
            runId: current.run?.id,
            assignments: current.forms
              .filter((f) => f.isRequired !== false)
              .map((f) => f.id),
          }),
          current.interview?.id ?? null,
          current.interview?.outcome === "not_selected"
            ? "rejected"
            : current.interview?.outcome === "withdrawn"
              ? "withdrawn"
              : null,
          current.stageSince,
          at,
          at,
        ),
      audit(owner, "legacy_imported", id, {
        candidateId: item.candidateId,
        previousStage: current.stage,
        manual: current.manual,
      }),
      cleanup,
    ]);
    imported++;
  }
  return { imported };
}
