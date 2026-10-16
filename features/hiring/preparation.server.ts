import "server-only";
import { isResponse } from "@/features/templates/template.server";
import type { WorkflowRun } from "@/features/workflows/workflow";
import { getDatabaseBinding } from "@/db";
import { getRun } from "@/features/workflows/workflow.server";
import {
  graphIssues,
  isApplicationTrigger,
  workflowTrigger,
  type WorkflowGraph,
} from "@/features/workflows/workflow";
import { preparationProofSql } from "@/features/interviews/preparation-proof.server";
import {
  applicationEvent,
  applicationProof,
  getApplication,
  hiringBatch,
  hiringFail,
  hiringGuard,
  hiringId,
  nowIso,
  requireEvidence,
} from "./hiring.server";

export async function applicationPreparation(owner: string, id: string) {
  const app = await getApplication(owner, id),
    db = getDatabaseBinding();
  const forms = (
    await db
      .prepare(
        `SELECT f.id,t.name,f.status,f.application_id applicationId,v.version_number version,
    (SELECT s.id FROM submissions s WHERE s.recipient_link_id=f.recipient_link_id ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1) submissionId,
    (SELECT h.status FROM submission_reviews h JOIN submissions s ON s.id=h.submission_id WHERE s.recipient_link_id=f.recipient_link_id AND h.owner_email=? ORDER BY s.submitted_at DESC,s.id DESC LIMIT 1) reviewStatus,
    COALESCE(af.provenance,'legacy_link') provenance
    FROM form_assignments f JOIN templates t ON t.id=f.template_id AND t.owner_email=? JOIN template_versions v ON v.id=f.template_version_id
    LEFT JOIN hiring_application_forms af ON af.application_id=? AND af.assignment_id=f.id
    WHERE f.id IN (SELECT value FROM json_each(?)) ORDER BY f.assigned_at,f.id`,
      )
      .bind(owner, owner, id, JSON.stringify(app.evidence.assignments ?? []))
      .all<{
        id: string;
        name: string;
        status: string;
        applicationId: string | null;
        version: number;
        submissionId: string | null;
        reviewStatus: string | null;
        provenance: string;
      }>()
  ).results;
  let run: WorkflowRun | null = null;
  let runUnavailable = false;
  if (app.evidence.runId) {
    try {
      run = await getRun(owner, app.evidence.runId);
    } catch (error) {
      if (!isResponse(error) || error.status !== 404) throw error;
      runUnavailable = true;
    }
  }
  const account = await db
    .prepare(
      "SELECT u.id,u.email,COALESCE(u.banned,0) disabled FROM candidates c JOIN user u ON u.id=c.user_id JOIN recipient_profiles p ON p.user_id=u.id AND p.created_by_email=c.owner_email WHERE c.id=? AND c.owner_email=?",
    )
    .bind(app.candidateId, owner)
    .first<{ id: string; email: string; disabled: number }>();
  const overlaps = (
    await db
      .prepare(
        "SELECT id,workflow_name name,status FROM workflow_runs WHERE owner_email=? AND resume_id=? AND application_id IS NULL AND event_id IS NULL AND json_extract(graph_json,'$.nodes') IS NOT NULL AND (graph_json LIKE '%assign_forms%' OR graph_json LIKE '%create_account%' OR graph_json LIKE '%send_telegram%') AND status NOT IN ('rejected') AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow_run' AND x.entity_id=workflow_runs.id) ORDER BY created_at DESC LIMIT 20",
      )
      .bind(owner, app.resumeId)
      .all<{ id: string; name: string; status: string }>()
  ).results;
  return { forms, run, runUnavailable, account, overlaps };
}

export async function startApplicationPreparation(
  owner: string,
  id: string,
  body: Record<string, unknown>,
  automation?: { runId: string; token: string; chain: string[] },
) {
  const app = await getApplication(owner, id),
    db = getDatabaseBinding(),
    workflowId = hiringId(body.workflowId);
  if (app.outcome || app.hold)
    hiringFail("Reopen or resume before preparing documents.");
  if (body.confirmIndependent !== true)
    hiringFail(
      "Confirm that this preparation creates requirements for this application.",
    );
  const existing = await db
    .prepare(
      "SELECT id FROM workflow_runs WHERE owner_email=? AND application_id=? AND event_id IS NULL AND workflow_id=? AND resume_id=?",
    )
    .bind(owner, id, workflowId, app.resumeId)
    .first<{ id: string }>();
  if (existing) return { runId: existing.id, reused: true };
  if (app.revision !== body.expectedRevision)
    hiringFail(
      "This application changed. Refresh the preparation preview.",
      409,
    );
  await requireEvidence(owner, app, ["cv_approved"]);
  const current = await applicationPreparation(owner, id);
  if (current.run && !["completed", "rejected"].includes(current.run.status))
    hiringFail(
      "Finish or resolve this application's current preparation first.",
      409,
    );
  if (
    current.overlaps.some((r) =>
      ["queued", "running", "waiting_review"].includes(r.status),
    )
  )
    hiringFail(
      "A legacy preparation for this CV is still active. Finish or resolve it before starting an independent preparation.",
      409,
    );
  if (current.overlaps.length && body.confirmLegacySeparation !== true)
    hiringFail(
      "Review the existing preparation and confirm independent assignments, or explicitly link the existing preparation.",
    );
  const w = await db
    .prepare(
      "SELECT id,name,version,published_json FROM workflows WHERE id=? AND owner_email=? AND active=1 AND published_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow' AND x.entity_id=workflows.id)",
    )
    .bind(workflowId, owner)
    .first<{
      id: string;
      name: string;
      version: number;
      published_json: string;
    }>();
  if (!w) hiringFail("Choose an active published preparation workflow.");
  let published = w.published_json,
    publishedName = w.name;
  const pinnedVersion =
    body.publishedVersion === undefined
      ? w.version
      : Number(body.publishedVersion);
  if (!Number.isInteger(pinnedVersion) || pinnedVersion < 1)
    hiringFail("Choose a valid published preparation version.");
  if (pinnedVersion !== w.version) {
    const prior = await db
      .prepare(
        "SELECT graph_json,name FROM workflow_versions WHERE workflow_id=? AND owner_email=? AND version=?",
      )
      .bind(w.id, owner, pinnedVersion)
      .first<{ graph_json: string; name: string }>();
    if (!prior)
      hiringFail("The pinned preparation version is unavailable.", 409);
    published = prior.graph_json;
    publishedName = prior.name;
  }
  const graph = JSON.parse(published) as WorkflowGraph;
  if (
    isApplicationTrigger(workflowTrigger(graph)) ||
    graphIssues(graph).length ||
    !graph.nodes.some((n) => n.kind === "review_resume") ||
    !graph.nodes.some((n) =>
      ["assign_forms", "create_account"].includes(n.kind),
    )
  )
    hiringFail(
      "Choose a published preparation workflow with an explicit review step.",
    );
  const proof = await applicationProof(owner, app),
    runId = crypto.randomUUID(),
    at = nowIso();
  const [guard, cleanup] = hiringGuard(
    `EXISTS(SELECT 1 FROM hiring_applications WHERE id=? AND owner_email=? AND revision=? AND outcome IS NULL AND hold IS NULL) AND (SELECT proof FROM (${preparationProofSql}))=? AND EXISTS(SELECT 1 FROM workflows WHERE id=? AND owner_email=? AND version=? AND active=1) ${automation ? "AND EXISTS(SELECT 1 FROM workflow_runs WHERE id=? AND owner_email=? AND lock_token=? AND locked_until>?)" : ""}`,
    [
      id,
      owner,
      app.revision,
      owner,
      app.candidateId,
      proof,
      w.id,
      owner,
      w.version,
      ...(automation
        ? [automation.runId, owner, automation.token, nowIso()]
        : []),
    ],
  );
  await hiringBatch([
    guard,
    db
      .prepare(
        "INSERT INTO workflow_runs(id,workflow_id,owner_email,workflow_name,version,resume_id,application_id,graph_json,context_json,current_node_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        runId,
        w.id,
        owner,
        publishedName,
        pinnedVersion,
        app.resumeId,
        id,
        published,
        JSON.stringify({
          steps: {},
          preparationApplicationId: id,
          applicationChain: automation?.chain ?? [],
        }),
        graph.nodes.find((n) => n.kind === "resume_uploaded")!.id,
        at,
        at,
      ),
    applicationEvent(
      owner,
      { ...app, revision: app.revision + 1 },
      "preparation_started",
      null,
    ),
    cleanup,
  ]);
  return { runId, reused: false };
}
