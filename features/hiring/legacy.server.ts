import "server-only";
import { getDatabaseBinding } from "@/db";
import { isResponse } from "@/features/templates/template.server";
import { detailProgress } from "@/features/candidate-progress/progress.server";
import { preparationProofSql } from "@/features/interviews/preparation-proof.server";
import {
  applicationProof,
  createPipeline,
  getApplication,
  hiringBatch,
  hiringConfiguration,
  hiringFail,
  hiringGuard,
  hiringId,
  importLegacy,
  nowIso,
  savePipeline,
} from "./hiring.server";
import { legacyDefinition } from "./hiring";
const projection = `SELECT c.id,c.full_name name,c.email,cp.manual_stage,
 COALESCE(cp.selected_resume_id,ip.resume_id,(SELECT rr.id FROM resumes rr WHERE rr.candidate_id=c.id AND rr.owner_email=c.owner_email ORDER BY EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='resume' AND x.entity_id=rr.id),rr.created_at DESC,rr.id LIMIT 1)) resume_id,
 ip.id interview_id,ip.outcome interview_outcome,ip.snapshot_json,cp.primary_run_id,ip.created_at interview_created_at,
 (SELECT a.id FROM hiring_applications a WHERE a.owner_email=c.owner_email AND (a.intake=1 AND a.candidate_id=c.id OR a.interview_id=ip.id) ORDER BY a.created_at,a.id LIMIT 1) application_id,
 (SELECT count(*) FROM hiring_applications a WHERE a.owner_email=c.owner_email AND a.candidate_id=c.id) application_count
 FROM candidates c LEFT JOIN candidate_progress cp ON cp.candidate_id=c.id AND cp.owner_email=c.owner_email
 LEFT JOIN interview_processes ip ON ip.candidate_id=c.id AND ip.owner_email=c.owner_email AND ip.application_id IS NULL WHERE c.owner_email=?`;
type LegacyRow = {
  interview_created_at: string | null;
  snapshot_json: string | null;
  primary_run_id: string | null;
  id: string;
  name: string;
  email: string;
  manual_stage: string | null;
  resume_id: string | null;
  interview_id: string | null;
  interview_outcome: string | null;
  application_id: string | null;
  application_count: number;
};
async function digest(proof: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(proof),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function revision(owner: string, candidateId: string) {
  return digest(await applicationProof(owner, { candidateId }));
}
export async function legacyInventory(owner: string, query: URLSearchParams) {
  const db = getDatabaseBinding(),
    search = (query.get("search") ?? "").slice(0, 200),
    unmapped = query.get("mapped") !== "true";
  const sql = `SELECT * FROM (${projection}) WHERE instr(lower(name||' '||email),lower(?))>0 ${unmapped ? "AND application_id IS NULL" : ""}`;
  const total = (await db
    .prepare(`SELECT count(*) n FROM (${sql})`)
    .bind(owner, search)
    .first<{ n: number }>())!.n;
  const page = Math.min(
    Math.max(1, Math.ceil(total / 25)),
    Math.max(1, Math.floor(Number(query.get("page")) || 1)),
  );
  const rows = (
    await db
      .prepare(sql + " ORDER BY name,id LIMIT 25 OFFSET ?")
      .bind(owner, search, (page - 1) * 25)
      .all<LegacyRow>()
  ).results;
  return {
    total,
    page,
    pageSize: 25,
    items: await Promise.all(
      rows.map(async ({ snapshot_json, primary_run_id, ...row }) => ({
        ...row,
        proposedStage: row.interview_id ? "interviews" : row.manual_stage,
        hasRetainedPreparation: !!primary_run_id || !!snapshot_json,
        expectedRevision: row.application_id
          ? null
          : await revision(owner, row.id),
        canAdopt: !!row.resume_id,
        archived: row.resume_id
          ? !!(await db
              .prepare(
                "SELECT 1 FROM archive_records WHERE entity_type='resume' AND entity_id=? AND owner_email=?",
              )
              .bind(row.resume_id, owner)
              .first())
          : false,
      })),
    ),
  };
}
export async function adoptLegacy(
  owner: string,
  body: Record<string, unknown>,
) {
  const candidateId = hiringId(body.candidateId),
    db = getDatabaseBinding();
  const row = await db
    .prepare(projection + " AND c.id=?")
    .bind(owner, candidateId)
    .first<LegacyRow>();
  if (!row) hiringFail("Legacy candidate not found.", 404);
  if (row.application_id)
    return { applicationId: row.application_id, reused: true };
  if (body.confirmAdoption !== true)
    hiringFail(
      "Confirm the selected legacy CV, preparation and interview context before adoption.",
    );
  const proof = await applicationProof(owner, { candidateId });
  if (body.expectedRevision !== (await digest(proof)))
    hiringFail("This legacy record changed. Preview it again.", 409);
  let current;
  try {
    current = await detailProgress(owner, candidateId);
  } catch (e) {
    if (!isResponse(e) || ![404, 409].includes(e.status)) throw e;
  }
  if (current) {
    if ((await applicationProof(owner, { candidateId })) !== proof)
      hiringFail("This legacy record changed. Preview it again.", 409);
    await importLegacy(owner, {
      items: [{ candidateId, expectedRevision: current.revision }],
    });
    const mapped = await db
      .prepare(projection + " AND c.id=?")
      .bind(owner, candidateId)
      .first<LegacyRow>();
    return { applicationId: mapped!.application_id, reused: false };
  }
  if (!row.resume_id)
    hiringFail(
      "No retained CV is available. Open the legacy record to resolve its context.",
      409,
    );
  const cv = await db
    .prepare(
      "SELECT id FROM resumes WHERE id=? AND candidate_id=? AND owner_email=?",
    )
    .bind(row.resume_id, candidateId, owner)
    .first();
  if (!cv)
    hiringFail(
      "The retained CV does not match this candidate. Review its original records.",
      409,
    );
  let pipeline = (await hiringConfiguration(owner)).pipelines.find(
    (p) => p.name === "Legacy preparation" && !p.archived,
  );
  if (!pipeline) {
    const p = await createPipeline(owner, {
      name: "Legacy preparation",
      definition: legacyDefinition(),
    });
    await savePipeline(owner, p.id, {
      action: "publish",
      expectedRevision: 1,
      name: "Legacy preparation",
      definition: legacyDefinition(),
    });
    pipeline = (await hiringConfiguration(owner)).pipelines.find(
      (v) => v.id === p.id,
    );
  }
  const original = row.snapshot_json
    ? (JSON.parse(row.snapshot_json) as {
        runId?: string;
        forms?: { id: string }[];
      })
    : null;
  const retainedRun = row.primary_run_id ?? original?.runId;
  const run = retainedRun
    ? await db
        .prepare(
          "SELECT id FROM workflow_runs WHERE id=? AND owner_email=? AND resume_id=?",
        )
        .bind(retainedRun, owner, row.resume_id)
        .first<{ id: string }>()
    : null;
  const ids = original?.forms?.map((f) => f.id) ?? [];
  const assignments = (
    await db
      .prepare(
        "SELECT f.id FROM form_assignments f JOIN templates t ON t.id=f.template_id AND t.owner_email=? JOIN recipient_profiles p ON p.user_id=f.user_id AND p.created_by_email=t.owner_email WHERE f.id IN (SELECT value FROM json_each(?))",
      )
      .bind(owner, JSON.stringify(ids))
      .all<{ id: string }>()
  ).results.map((f) => f.id);
  const evidence = { runId: run?.id, assignments };
  const id = crypto.randomUUID(),
    at = nowIso();
  const retainedStage = row.interview_id ? "interviews" : row.manual_stage;
  const targetStage =
    retainedStage &&
    legacyDefinition().stages.some((s) => s.id === retainedStage)
      ? retainedStage
      : hiringId(body.stageId);
  if (!legacyDefinition().stages.some((s) => s.id === targetStage))
    hiringFail(
      "Choose the legacy stage that matches the reviewed original evidence.",
    );
  if (
    !retainedStage &&
    (typeof body.mappingReason !== "string" ||
      body.mappingReason.trim().length < 10 ||
      body.mappingReason.length > 1000)
  )
    hiringFail(
      "Explain the stage mapping for this archived or incomplete record.",
    );
  const [guard, cleanup] = hiringGuard(
    `(SELECT proof FROM (${preparationProofSql}))=? AND NOT EXISTS(SELECT 1 FROM hiring_applications WHERE candidate_id=? AND owner_email=? AND intake=1)`,
    [owner, candidateId, proof, candidateId, owner],
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
        candidateId,
        row.resume_id,
        pipeline!.currentVersionId,
        targetStage,
        JSON.stringify(evidence),
        row.interview_id,
        row.interview_outcome === "not_selected"
          ? "rejected"
          : row.interview_outcome === "withdrawn"
            ? "withdrawn"
            : null,
        row.interview_id ? row.interview_created_at : null,
        at,
        at,
      ),
    db
      .prepare(
        "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,'owner',?,'hiring.legacy_adopted','hiring',?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        owner,
        owner,
        id,
        JSON.stringify({
          candidateId,
          retainedCv: row.resume_id,
          interviewId: row.interview_id,
          unknownStageStart: !row.interview_created_at,
          previousStage: row.manual_stage,
          mappedStage: targetStage,
          mappingReason:
            body.mappingReason ?? "Preserved original legacy stage",
        }),
        at,
      ),
    cleanup,
  ]);
  await getApplication(owner, id);
  return { applicationId: id, reused: false };
}
