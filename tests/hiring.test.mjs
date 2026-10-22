import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import {
  seedAcceptedPreparation,
  insertFixture,
} from "./helpers/interview-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = {
  DB: null,
  MANAGEMENT_EMAIL: "a@owner.test",
  AUTH_BOOTSTRAP_TOKEN: "local-hiring-tests-bootstrap",
  FILES: { async delete() {} },
  TEST_DATA_RESET_ENABLED: "true",
  ENVIRONMENT: "development",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "local-hiring-test-secret-only-32-characters",
};
globalThis.__telegramTestEnv = runtime;
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: {
    alias: {
      "@": root,
      "server-only": root + "/tests/helpers/server-only.mjs",
      "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs",
    },
  },
  server: { middlewareMode: true, hmr: false },
});
const service = await vite.ssrLoadModule("/features/hiring/hiring.server.ts");
const automation = await vite.ssrLoadModule(
  "/features/hiring/automation.server.ts",
);
const workflow = await vite.ssrLoadModule(
  "/features/workflows/workflow.server.ts",
);
const runner = await vite.ssrLoadModule("/features/workflows/runner.server.ts");
const model = await vite.ssrLoadModule("/features/hiring/hiring.ts");
const presentation = await vite.ssrLoadModule("/features/hiring/presentation.ts");
const graphs = await vite.ssrLoadModule("/features/workflows/workflow.ts");
const interviews = await vite.ssrLoadModule(
  "/features/hiring/interview.server.ts",
);
const preparation = await vite.ssrLoadModule(
  "/features/candidate-progress/progress.server.ts",
);
const reset = await vite.ssrLoadModule("/features/test-data/reset.server.ts");
const archive = await vite.ssrLoadModule("/features/archive/archive.server.ts");
const applicationPreparation = await vite.ssrLoadModule(
  "/features/hiring/preparation.server.ts",
);
const legacyWorkspace = await vite.ssrLoadModule(
  "/features/hiring/legacy.server.ts",
);
const interviewService = await vite.ssrLoadModule(
  "/features/interviews/interviews.server.ts",
);
after(async () => {
  runtime.DB?.close();
  await vite.close();
});
function fixture(t) {
  runtime.DB?.close();
  runtime.DB = sqliteD1();
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2030, 0, 2) });
  return {
    ...seedAcceptedPreparation(runtime.DB.sqlite),
    db: runtime.DB.sqlite,
  };
}
async function rejects(promise, status) {
  await assert.rejects(
    promise,
    (e) => e instanceof Response && e.status === status,
  );
}
async function pipeline(f, definition = model.initialDefinition()) {
  const p = await service.createPipeline(f.owner, {
    name: "Engineering",
    definition,
  });
  await service.savePipeline(f.owner, p.id, {
    action: "publish",
    expectedRevision: 1,
    name: "Engineering",
    definition,
  });
  const config = await service.hiringConfiguration(f.owner);
  return config.pipelines.find((v) => v.id === p.id);
}
async function application(f, p, jobId) {
  return service.createApplication(f.owner, {
    candidateId: f.candidateId,
    resumeId: f.resumeId,
    pipelineVersionId: p.currentVersionId,
    jobId,
    mutationId: crypto.randomUUID(),
  });
}
async function publishedCvRouting(f, p, values = {}) {
  const w = await workflow.createWorkflow(f.owner, "telegram_submission");
  const graph = graphs.defaultGraph();
  graph.nodes = graph.nodes.filter((n) => ["upload", "extract", "review", "done", "stop"].includes(n.id));
  graph.nodes[0].config.trigger = "telegram_submission";
  graph.nodes.push(
    { id: "position", kind: "condition", position: { x: 0, y: 0 }, config: { field: "appliedPosition", value: "Frontend Dev" } },
    { id: "move", kind: "move_stage", position: { x: 0, y: 0 }, config: { pipelineVersionId: p.currentVersionId, fromStageId: "applied", stageId: "screening", ...values } },
  );
  graph.edges = graph.edges.filter((e) => ["upload-extract", "extract-review", "review-stop"].includes(e.id));
  graph.edges.push(
    { id: "review-position", source: "review", target: "position", outcome: "approved" },
    { id: "position-move", source: "position", target: "move", outcome: "yes" },
    { id: "position-stop", source: "position", target: "stop", outcome: "no" },
    { id: "move-done", source: "move", target: "done", outcome: "next" },
  );
  return workflow.saveWorkflow(f.owner, w.id, { action: "publish", name: "TEST Telegram CV routing", graph, expectedUpdatedAt: w.updatedAt });
}
async function reviewedCvRouting(f, w, action = "approve") {
  f.db.prepare("UPDATE candidates SET normalized_email=email,date_of_birth=NULL WHERE id=?").run(f.candidateId);
  f.db.prepare("UPDATE resumes SET source='telegram',applied_position='Frontend Dev' WHERE id=?").run(f.resumeId);
  await runtime.DB.batch(await workflow.uploadWorkflowStatements(f.owner, f.resumeId, new Date().toISOString(), "telegram_submission"));
  const { id } = f.db.prepare("SELECT id FROM workflow_runs WHERE workflow_id=?").get(w.id);
  await runner.processWorkflowRun(id);
  assert.equal((await workflow.getRun(f.owner, id)).status, "waiting_review");
  const reviews = await vite.ssrLoadModule("/features/workflows/review.server.ts");
  const data = await reviews.getReviewData(f.owner, id);
  await reviews.reviewRun(f.owner, id, {
    action, candidate: data.candidate, checks: [true, true, true],
    resumeRevision: data.resumeRevision, candidateRevision: data.candidateRevision,
    existingAccountId: f.userId, note: action === "reject" ? "CV does not meet the requirements" : "Reviewed CV",
  });
  return id;
}

test("Telegram CV workflow keeps its trigger and moves its default-inbox application only after HR review", async (t) => {
  const original = fixture(t), p = await pipeline(original);
  await service.savePipeline(original.owner, p.id, { action: "default", expectedRevision: p.revision });
  const f = { ...seedAcceptedPreparation(original.db, "telegram", original.owner), db: original.db };
  const app = await service.getApplication(f.owner, `inbox_${f.candidateId}`);
  const w = await publishedCvRouting(f, p);
  assert.equal(w.published.nodes[0].config.trigger, "telegram_submission");
  assert.equal(w.published.nodes.find((n) => n.id === "move").config.stageLabel, "CV screening");
  const id = await reviewedCvRouting(f, w);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
  await runner.processWorkflowRun(id);
  const run = await workflow.getRun(f.owner, id);
  assert.equal(run.status, "completed", run.errorMessage);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "screening");
  assert.equal(run.context.applicationMoves.move.applicationId, app.id);
  const row = f.db.prepare("SELECT event_id,application_id FROM workflow_runs WHERE id=?").get(id);
  assert.equal(row.event_id, null);
  assert.equal(row.application_id, null);
  await runtime.DB.batch(await workflow.uploadWorkflowStatements(f.owner, f.resumeId, new Date().toISOString(), "telegram_submission"));
  assert.equal(f.db.prepare("SELECT count(*) n FROM workflow_runs WHERE workflow_id=?").get(w.id).n, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM telegram_deliveries").get().n, 0);
});

test("rejected CVs and unmatched positions never move an application", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p), w = await publishedCvRouting(f, p);
  const id = await reviewedCvRouting(f, w, "reject");
  await runner.processWorkflowRun(id);
  assert.equal((await workflow.getRun(f.owner, id)).status, "rejected");
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
  const second = await publishedCvRouting(f, p);
  const next = await reviewedCvRouting(f, second);
  f.db.prepare("UPDATE resumes SET applied_position='Backend Dev' WHERE id=?").run(f.resumeId);
  await runner.processWorkflowRun(next);
  const run = await workflow.getRun(f.owner, next);
  assert.equal(run.status, "completed");
  assert.equal(run.context.applicationMoves, undefined);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("CV routing fails clearly when no application exists in the chosen pipeline", async (t) => {
  const f = fixture(t), p = await pipeline(f), other = await pipeline(f), app = await application(f, other);
  const w = await publishedCvRouting(f, p), id = await reviewedCvRouting(f, w);
  await runner.processWorkflowRun(id);
  const run = await workflow.getRun(f.owner, id);
  assert.equal(run.status, "failed");
  assert.match(run.errorMessage, /No active application.*default inbox/);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("CV routing never guesses between multiple applications, even if only one is in the expected stage", async (t) => {
  const f = fixture(t), p = await pipeline(f), a = await application(f, p), b = await application(f, p);
  await mutate(f, b, { action: "move", stageId: "screening" });
  const w = await publishedCvRouting(f, p), id = await reviewedCvRouting(f, w);
  await runner.processWorkflowRun(id);
  assert.match((await workflow.getRun(f.owner, id)).errorMessage, /More than one active application/);
  assert.equal((await service.getApplication(f.owner, a.id)).stageId, "applied");
});

test("CV routing retains stage evidence requirements and blocks incomplete preparation", async (t) => {
  const f = fixture(t), definition = model.initialDefinition();
  definition.stages[1].entry = ["preparation_ready"];
  const p = await pipeline(f, definition), app = await application(f, p), w = await publishedCvRouting(f, p);
  const id = await reviewedCvRouting(f, w);
  await runner.processWorkflowRun(id);
  const run = await workflow.getRun(f.owner, id);
  assert.equal(run.status, "failed");
  assert.match(run.errorMessage, /preparation/i);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("CV routing rejects changed approval and unexpected current stages", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p);
  const w = await publishedCvRouting(f, p), id = await reviewedCvRouting(f, w);
  f.db.prepare("UPDATE resumes SET verification_status='unverified' WHERE id=?").run(f.resumeId);
  await runner.processWorkflowRun(id);
  assert.match((await workflow.getRun(f.owner, id)).errorMessage, /approved CV changed/);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
  const second = await publishedCvRouting(f, p, { fromStageId: "screening", stageId: "recruiter" });
  const next = await reviewedCvRouting(f, second);
  await runner.processWorkflowRun(next);
  assert.match((await workflow.getRun(f.owner, next)).errorMessage, /expected source stage/);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("CV routing reuses a committed move receipt after its execution checkpoint is lost", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p), w = await publishedCvRouting(f, p);
  const id = await reviewedCvRouting(f, w);
  await runner.processWorkflowRun(id);
  const first = await workflow.getRun(f.owner, id);
  assert.equal(first.status, "completed", first.errorMessage);
  const context = structuredClone(first.context);
  delete context.steps.move;
  delete context.steps.done;
  f.db.prepare("UPDATE workflow_runs SET status='queued',current_node_id='move',context_json=? WHERE id=?").run(JSON.stringify(context), id);
  await runner.processWorkflowRun(id);
  const run = await workflow.getRun(f.owner, id);
  assert.equal(run.status, "completed", run.errorMessage);
  assert.equal((await service.getApplication(f.owner, app.id)).revision, 2);
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events WHERE application_id=? AND kind='stage_entered'").get(app.id).n, 1);
});

test("CV move publication validates pipeline ownership and stage membership on the server", async (t) => {
  const f = fixture(t), p = await pipeline(f);
  await rejects(publishedCvRouting(f, p, { stageId: "foreign-stage" }), 422);
  await rejects(publishedCvRouting(f, { currentVersionId: "foreign-pipeline" }), 422);
  await rejects(publishedCvRouting(f, p, { pipelineVersionId: "" }), 422);
  const foreign = { ...seedAcceptedPreparation(f.db, "foreign"), db: f.db };
  const foreignPipeline = await pipeline(foreign);
  await rejects(publishedCvRouting(f, foreignPipeline), 422);
});

test("CV routing cannot move after losing its worker lease or a competing application revision", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p), w = await publishedCvRouting(f, p);
  const id = await reviewedCvRouting(f, w), claim = await workflow.claimRun(id);
  const move = (await vite.ssrLoadModule("/features/hiring/resume-routing.server.ts")).moveResumeApplication;
  const node = w.published.nodes.find((n) => n.id === "move");
  const context = JSON.parse(claim.row.contextJson);
  await assert.rejects(move(claim.row, claim.token, node, context, async () => {
    f.db.prepare("UPDATE workflow_runs SET lock_token='another-worker' WHERE id=?").run(id);
  }), /Hiring records changed/);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events WHERE kind='stage_entered'").get().n, 0);
  f.db.prepare("UPDATE workflow_runs SET status='queued',lock_token=NULL,locked_until=NULL WHERE id=?").run(id);
  const next = await workflow.claimRun(id);
  const changedContext = JSON.parse(next.row.contextJson);
  await assert.rejects(move(next.row, next.token, node, changedContext, async () => {
    await mutate(f, app, { action: "hold", reason: "Owner paused this application" });
  }), /application changed/);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("CV routing's approval proof cannot change between approval checking and mutation", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p), w = await publishedCvRouting(f, p);
  const id = await reviewedCvRouting(f, w), claim = await workflow.claimRun(id);
  const proof = await service.applicationProof(f.owner, app);
  f.db.prepare("UPDATE resumes SET updated_at='2031-01-01T00:00:00.000Z',verification_status='unverified' WHERE id=?").run(f.resumeId);
  await rejects(service.mutateApplication(f.owner, app.id, {
    action: "move", stageId: "screening", fromStageId: "applied", expectedRevision: app.revision,
    mutationId: "test-cv-proof-race", reason: "Published CV workflow after HR approval",
  }, { runId: id, token: claim.token, chain: [], workflowId: w.id, expectedProof: proof }), 409);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});
async function mutate(f, app, values) {
  return service.mutateApplication(f.owner, app.id, {
    expectedRevision: app.revision,
    mutationId: crypto.randomUUID(),
    ...values,
  });
}

test("permanent deletion previews without mutation and deletes an unused application while retaining its candidate and CV", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p);
  const preview = await archive.previewDeletion(f.owner, "hiring_application", app.id);
  assert.equal(preview.members.length, 1);
  assert.equal(preview.members[0].reason, null);
  assert.equal(await archive.isArchived("hiring_application", app.id), false);
  await rejects(archive.previewDeletion("foreign@owner.test", "hiring_application", app.id), 404);
  await archive.deleteEntity(f.owner, "hiring_application", app.id, preview.state);
  assert.equal(f.db.prepare("SELECT id FROM hiring_applications WHERE id=?").get(app.id), undefined);
  assert.equal(f.db.prepare("SELECT id FROM hiring_events WHERE application_id=?").get(app.id), undefined);
  assert(f.db.prepare("SELECT id FROM candidates WHERE id=?").get(f.candidateId));
  assert(f.db.prepare("SELECT id FROM resumes WHERE id=?").get(f.resumeId));
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_guards").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE target_id=? AND action IN ('record.archived','record.deleted_permanently')").get(app.id).n, 2);
});

test("progressed applications remain protected and archive/restore does not replay pending automation", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p);
  const held = await mutate(f, app, { action: "hold", reason: "Awaiting candidate" });
  const preview = await archive.previewDeletion(f.owner, "hiring_application", app.id);
  assert.match(preview.members[0].reason, /hiring progress/);
  await rejects(archive.deleteEntity(f.owner, "hiring_application", app.id, preview.state), 409);
  assert.equal(await archive.isArchived("hiring_application", app.id), false);
  const receipt = await archive.archiveEntity(f.owner, "hiring_application", app.id);
  assert.equal((await service.listApplications(f.owner, new URLSearchParams())).total, 0);
  await rejects(service.getApplication(f.owner, app.id), 404);
  await rejects(mutate(f, held, { action: "resume", reason: "Resume review" }), 404);
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events WHERE application_id=? AND status='pending'").get(app.id).n, 0);
  await archive.restoreEntity(f.owner, "hiring_application", app.id, receipt.archivedAt);
  assert.equal((await service.getApplication(f.owner, app.id)).hold, "Awaiting candidate");
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events WHERE application_id=? AND status='pending'").get(app.id).n, 0);
});

test("unused pipeline versions delete together; pipeline archives stay synchronized with Archive", async (t) => {
  const f = fixture(t), p = await pipeline(f);
  const archivedConfig = await service.savePipeline(f.owner, p.id, { action: "archive", expectedRevision: p.revision });
  assert.equal(await archive.isArchived("hiring_pipeline", p.id), true);
  const record = await archive.archivedGroup(f.owner, "hiring_pipeline", p.id);
  await archive.restoreEntity(f.owner, "hiring_pipeline", p.id, record.record.archived_at);
  const restored = (await service.hiringConfiguration(f.owner)).pipelines.find((v) => v.id === p.id);
  assert.equal(restored.archived, false);
  assert(restored.revision > archivedConfig.pipelines.find((v) => v.id === p.id).revision);
  const preview = await archive.previewDeletion(f.owner, "hiring_pipeline", p.id);
  assert.equal(preview.members[0].reason, null);
  await archive.deleteEntity(f.owner, "hiring_pipeline", p.id, preview.state);
  assert.equal(f.db.prepare("SELECT id FROM hiring_pipelines WHERE id=?").get(p.id), undefined);
  assert.equal(f.db.prepare("SELECT id FROM hiring_pipeline_versions WHERE pipeline_id=?").get(p.id), undefined);
});

test("linked pipelines and changed deletion previews cannot remove active records", async (t) => {
  const f = fixture(t), p = await pipeline(f);
  const preview = await archive.previewDeletion(f.owner, "hiring_pipeline", p.id);
  const app = await application(f, p);
  await rejects(archive.deleteEntity(f.owner, "hiring_pipeline", p.id, preview.state), 409);
  assert.equal(await archive.isArchived("hiring_pipeline", p.id), false);
  const protectedPreview = await archive.previewDeletion(f.owner, "hiring_pipeline", p.id);
  assert.match(protectedPreview.members[0].reason, /used by jobs, applications/);
  const applicationPreview = await archive.previewDeletion(f.owner, "hiring_application", app.id);
  const originalBatch = runtime.DB.batch;
  runtime.DB.batch = async (statements) => {
    runtime.DB.batch = originalBatch;
    f.db.prepare("UPDATE hiring_applications SET revision=revision+1 WHERE id=?").run(app.id);
    return originalBatch(statements);
  };
  await rejects(archive.deleteEntity(f.owner, "hiring_application", app.id, applicationPreview.state), 409);
  assert.equal(await archive.isArchived("hiring_application", app.id), false);
  assert(f.db.prepare("SELECT id FROM hiring_applications WHERE id=?").get(app.id));
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_guards").get().n, 0);
});

test("direct deletion API enforces owner access, same-origin confirmation and a fresh preview", async (t) => {
  const f = fixture(t), p = await pipeline(f);
  const apiVite = await createServer({
    appType: "custom", configFile: false, root,
    resolve: { alias: { "@": root, "server-only": root + "/tests/helpers/server-only.mjs", "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs" } },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  t.after(() => apiVite.close());
  const route = await apiVite.ssrLoadModule("/app/api/archive/[type]/[id]/route.ts");
  const context = { params: Promise.resolve({ type: "hiring_pipeline", id: p.id }) };
  const path = `http://localhost:5173/api/archive/hiring_pipeline/${p.id}`;
  assert.equal((await route.GET(new Request(`${path}?preview=delete`, { headers: { "x-owner-email": f.owner } }), context)).status, 401);
  const cookie = await ownerCookie(f, apiVite);
  const previewResponse = await route.GET(new Request(`${path}?preview=delete`, { headers: { cookie } }), context);
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json();
  const remove = (body, origin = "http://localhost:5173") => route.POST(new Request(path, {
    method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body),
  }), context);
  assert.equal((await remove({ action: "delete_permanently", confirm: true, expectedState: preview.state }, "https://other.invalid")).status, 403);
  assert.equal((await remove({ action: "delete_permanently", confirm: false, expectedState: preview.state })).status, 409);
  assert.equal((await remove({ action: "delete_permanently", confirm: true, expectedState: "stale" })).status, 409);
  assert.equal(await archive.isArchived("hiring_pipeline", p.id), false);
  assert.equal((await remove({ action: "delete_permanently", confirm: true, expectedState: preview.state })).status, 200);
  assert.equal(f.db.prepare("SELECT id FROM hiring_pipelines WHERE id=?").get(p.id), undefined);
});

test("a concurrent pipeline dependency rolls back the entire archive-and-delete batch", async (t) => {
  const f = fixture(t), p = await pipeline(f);
  const preview = await archive.previewDeletion(f.owner, "hiring_pipeline", p.id);
  const originalBatch = runtime.DB.batch;
  runtime.DB.batch = async (statements) => {
    runtime.DB.batch = originalBatch;
    insertFixture(f.db, "hiring_jobs", { id: "concurrent-job", owner_email: f.owner, title: "New job", pipeline_version_id: p.currentVersionId });
    return originalBatch(statements);
  };
  await rejects(archive.deleteEntity(f.owner, "hiring_pipeline", p.id, preview.state), 409);
  assert.equal(await archive.isArchived("hiring_pipeline", p.id), false);
  assert.equal(f.db.prepare("SELECT archived FROM hiring_pipelines WHERE id=?").get(p.id).archived, 0);
  assert(f.db.prepare("SELECT id FROM hiring_pipeline_versions WHERE id=?").get(p.currentVersionId));
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_events WHERE target_id=? AND action='record.archived'").get(p.id).n, 0);
});

test("direct deletion removes eligible workflows and forms and keeps file cleanup durable on storage failure", async (t) => {
  const f = fixture(t), w = await workflow.createWorkflow(f.owner, "manual");
  insertFixture(f.db, "templates", { id: "unused-form", owner_email: f.owner, name: "Unused form", kind: "form", file_key: "forms/unused.pdf", file_name: "unused.pdf", annotations_json: "[]", page_order_json: "[]" });
  const deletedKeys = [], originalFiles = runtime.FILES;
  runtime.FILES = { async delete(key) { deletedKeys.push(key); throw new Error("Mock storage unavailable"); } };
  try {
    for (const [type, id] of [["workflow", w.id], ["template", "unused-form"]]) {
      const preview = await archive.previewDeletion(f.owner, type, id);
      assert.equal(preview.members[0].reason, null);
      await archive.deleteEntity(f.owner, type, id, preview.state);
      assert.equal(await archive.isArchived(type, id), false);
    }
  } finally { runtime.FILES = originalFiles; }
  assert.equal(f.db.prepare("SELECT id FROM workflows WHERE id=?").get(w.id), undefined);
  assert.equal(f.db.prepare("SELECT id FROM templates WHERE id='unused-form'").get(), undefined);
  assert(deletedKeys.includes("forms/unused.pdf"));
  assert(f.db.prepare("SELECT id FROM storage_cleanup_jobs WHERE object_key='forms/unused.pdf'").get());
  const protectedForm = await archive.previewDeletion(f.owner, "template", f.templateId);
  assert.match(protectedForm.members[0].reason, /assignments or submitted forms/);
  await rejects(archive.deleteEntity(f.owner, "template", f.templateId, protectedForm.state), 409);
  assert.equal(await archive.isArchived("template", f.templateId), false);
});
async function routing(
  f,
  p,
  {
    trigger = "application_received",
    from = "applied",
    to = "screening",
    condition,
    stage,
  } = {},
) {
  const w = await workflow.createWorkflow(f.owner, trigger);
  const graph = graphs.applicationGraph(trigger);
  graph.nodes[0].config = {
    trigger,
    pipelineVersionId: p.currentVersionId,
    ...(stage ? { stageId: stage } : {}),
  };
  graph.nodes[1].config = { fromStageId: from, stageId: to };
  if (condition) {
    graph.nodes.push({
      id: "condition",
      kind: "condition",
      position: { x: 100, y: 200 },
      config: condition,
    });
    graph.edges = graph.edges.filter((e) => e.id !== "start-move");
    graph.edges.push(
      {
        id: "start-condition",
        source: "start",
        target: "condition",
        outcome: "next",
      },
      {
        id: "condition-yes",
        source: "condition",
        target: "move",
        outcome: "yes",
      },
      {
        id: "condition-no",
        source: "condition",
        target: "done",
        outcome: "no",
      },
    );
  }
  return workflow.saveWorkflow(f.owner, w.id, {
    action: "publish",
    name: "Route frontend",
    graph,
    expectedUpdatedAt: w.updatedAt,
  });
}
async function drain() {
  await automation.dispatchApplicationEvents();
  await runner.processPendingWorkflowRuns();
}
test("pipeline draft saves and publications update one pipeline with a stable identity", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await rejects(
    service.savePipeline("other@owner.test", p.id, {
      expectedRevision: p.revision,
      action: "archive",
    }),
    404,
  );
  const job = await service.saveJob(f.owner, {
    title: "Frontend Developer",
    pipelineVersionId: p.currentVersionId,
  });
  const app = await application(f, p, job.id);
  const definition = model.initialDefinition();
  definition.stages[1].name = "CV triage";
  definition.stages.reverse();
  const saved = await service.savePipeline(f.owner, p.id, {
    action: "save", name: "Engineering updated", definition, expectedRevision: p.revision,
  });
  assert.equal(saved.versions.length, 1);
  assert.equal(saved.versions[0].definition.stages[1].name, "CV screening");
  assert.equal(saved.pipelines[0].currentVersionId, p.currentVersionId);
  await service.savePipeline(f.owner, p.id, {
    action: "publish",
    name: "Engineering updated",
    definition,
    expectedRevision: saved.pipelines[0].revision,
  });
  const config = await service.hiringConfiguration(f.owner);
  assert.equal(config.versions.length, 1);
  assert.equal(config.versions[0].id, p.currentVersionId);
  assert.equal(
    config.versions.find((v) => v.id === app.pipelineVersionId).definition
      .stages.find((s) => s.id === "screening").name,
    "CV triage",
  );
  assert.equal(config.jobs[0].pipelineVersionId, app.pipelineVersionId);
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "applied",
  );
  const again = await service.savePipeline(f.owner, p.id, {
    action: "publish", name: "Engineering updated", definition, expectedRevision: config.pipelines[0].revision,
  });
  assert.equal(again.versions.length, 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_pipeline_versions WHERE pipeline_id=?").get(p.id).n, 1);
  await rejects(
    service.savePipeline(f.owner, p.id, {
      action: "archive",
      expectedRevision: p.revision,
    }),
    409,
  );
});
test("publishing refuses to remove stages referenced by applications or automation", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p);
  const definition = model.initialDefinition();
  definition.stages = definition.stages.filter((s) => s.id !== "applied");
  const draft = await service.savePipeline(f.owner, p.id, { action: "save", name: p.name, definition, expectedRevision: p.revision });
  await rejects(service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition, expectedRevision: draft.pipelines[0].revision }), 409);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
  assert.throws(() => f.db.prepare("UPDATE hiring_pipeline_versions SET definition_json=? WHERE id=?").run(JSON.stringify(definition), p.currentVersionId), /HIRING_STAGE_IN_USE/);
  await routing(f, p, { trigger: "stage_entered", stage: "recruiter", from: "recruiter", to: "technical" });
  const current = await service.hiringConfiguration(f.owner);
  const withoutAutomationStage = model.initialDefinition();
  withoutAutomationStage.stages = withoutAutomationStage.stages.filter((s) => s.id !== "recruiter");
  await rejects(service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition: withoutAutomationStage, expectedRevision: current.pipelines[0].revision }), 409);
  const withoutUnusedStage = model.initialDefinition();
  withoutUnusedStage.stages = withoutUnusedStage.stages.filter((s) => s.id !== "documents");
  const published = await service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition: withoutUnusedStage, expectedRevision: current.pipelines[0].revision });
  assert.equal(published.versions.length, 1);
  assert(!published.versions[0].definition.stages.some((s) => s.id === "documents"));
});

test("pipeline publication changes live requirements for existing applications", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p);
  const definition = model.initialDefinition();
  definition.stages[1].entry = ["forms_accepted"];
  await service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition, expectedRevision: p.revision });
  await rejects(mutate(f, app, { action: "move", stageId: "screening" }), 422);
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("draft-only saves create no published copies and stale publication cannot create another", async (t) => {
  const f = fixture(t), created = await service.createPipeline(f.owner, { name: "One pipeline" });
  let p = (await service.hiringConfiguration(f.owner)).pipelines[0];
  for (let i = 0; i < 3; i++) {
    const config = await service.savePipeline(f.owner, created.id, { action: "save", name: p.name, definition: p.draft, expectedRevision: p.revision });
    p = config.pipelines[0];
    assert.equal(config.versions.length, 0);
    assert.equal(config.pipelines.length, 1);
  }
  const published = await service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition: p.draft, expectedRevision: p.revision });
  await rejects(service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition: p.draft, expectedRevision: p.revision }), 409);
  assert.equal(published.versions.length, 1);
  assert.equal(published.versions[0].version, undefined);
  assert.equal(published.pipelines[0].publishedVersion, undefined);
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_pipeline_versions").get().n, 1);
});

test("a concurrent pipeline publication prevents a move based on stale requirements", async (t) => {
  const f = fixture(t), p = await pipeline(f), app = await application(f, p);
  const originalBatch = runtime.DB.batch.bind(runtime.DB);
  let intercept = true;
  runtime.DB.batch = async (statements) => {
    if (intercept && statements.some((s) => s.query.includes("UPDATE hiring_applications SET resume_id="))) {
      intercept = false;
      const definition = model.initialDefinition();
      definition.stages[1].entry = ["forms_accepted"];
      await service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition, expectedRevision: p.revision });
    }
    return originalBatch(statements);
  };
  try {
    await rejects(mutate(f, app, { action: "move", stageId: "screening" }), 409);
  } finally {
    runtime.DB.batch = originalBatch;
  }
  assert.equal((await service.getApplication(f.owner, app.id)).stageId, "applied");
});

test("workflow publication rejects pipeline stages removed after validation", async (t) => {
  const f = fixture(t), p = await pipeline(f), w = await workflow.createWorkflow(f.owner, "application_received");
  const graph = graphs.applicationGraph("application_received");
  graph.nodes[0].config.pipelineVersionId = p.currentVersionId;
  graph.nodes[1].config = { fromStageId: "applied", stageId: "recruiter" };
  const originalPrepare = runtime.DB.prepare;
  let intercept = true;
  runtime.DB.prepare = (query) => {
    const statement = originalPrepare(query);
    if (!intercept || !query.startsWith('update "workflows"')) return statement;
    const originalBind = statement.bind.bind(statement);
    statement.bind = (...values) => {
      const bound = originalBind(...values), originalAll = bound.all.bind(bound), originalRaw = bound.raw.bind(bound);
      const beforeQuery = async () => {
        if (intercept) {
          intercept = false;
          const definition = model.initialDefinition();
          definition.stages = definition.stages.filter((s) => s.id !== "recruiter");
          await service.savePipeline(f.owner, p.id, { action: "publish", name: p.name, definition, expectedRevision: p.revision });
        }
      };
      bound.all = async () => { await beforeQuery(); return originalAll(); };
      bound.raw = async () => { await beforeQuery(); return originalRaw(); };
      return bound;
    };
    return statement;
  };
  try {
    await rejects(workflow.saveWorkflow(f.owner, w.id, { action: "publish", name: "New routing", graph, expectedUpdatedAt: w.updatedAt }), 409);
  } finally {
    runtime.DB.prepare = originalPrepare;
  }
  assert.equal(intercept, false);
  assert.equal((await workflow.getWorkflow(f.owner, w.id)).published, null);
});

test("single-pipeline migration consolidates old copies and preserves applications, jobs, events and workflow snapshots", async (t) => {
  runtime.DB?.close();
  runtime.DB = sqliteD1({ through: "0034_record_deletion.sql" });
  const db = runtime.DB.sqlite, f = { ...seedAcceptedPreparation(db), db };
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2030, 0, 2) });
  const definition = model.initialDefinition(), old = structuredClone(definition);
  old.stages[1].id = "previous-screening";
  old.stages[2].id = "previous-interview";
  insertFixture(db, "hiring_pipelines", { id: "existing-pipeline", owner_email: f.owner, name: "Engineering", draft_json: JSON.stringify(definition), current_version_id: "current-published", published_version: 2 });
  for (const [id, version, value] of [["old-published", 1, old], ["current-published", 2, definition]])
    insertFixture(db, "hiring_pipeline_versions", { id, pipeline_id: "existing-pipeline", owner_email: f.owner, name: "Engineering", version, definition_json: JSON.stringify(value) });
  insertFixture(db, "hiring_jobs", { id: "existing-job", owner_email: f.owner, title: "Frontend", pipeline_version_id: "old-published" });
  insertFixture(db, "hiring_applications", { id: "existing-application", owner_email: f.owner, candidate_id: f.candidateId, resume_id: f.resumeId, job_id: "existing-job", pipeline_version_id: "old-published", stage_id: "previous-screening" });
  const second = seedAcceptedPreparation(db, "retained-interview", f.owner);
  insertFixture(db, "hiring_applications", { id: "retained-interview-app", owner_email: f.owner, candidate_id: second.candidateId, resume_id: second.resumeId, job_id: "existing-job", pipeline_version_id: "old-published", stage_id: "previous-interview" });
  const graph = graphs.applicationGraph("application_received");
  graph.nodes[0].config = { trigger: "application_received", pipelineVersionId: "old-published" };
  graph.nodes[1].config = { fromStageId: "previous-screening", stageId: "screening" };
  const snapshot = JSON.stringify(graph);
  insertFixture(db, "workflows", { id: "existing-routing", owner_email: f.owner, name: "Existing application routing", active: 1, version: 1, draft_json: snapshot, published_json: snapshot });
  const eventContext = JSON.stringify({ pipelineVersionId: "old-published", stageId: "previous-screening", fromStageId: null, jobId: "existing-job", applicationRevision: 1, chain: [] });
  insertFixture(db, "hiring_events", { id: "existing-event", application_id: "existing-application", owner_email: f.owner, kind: "application_received", to_stage: "previous-screening", actor: f.owner, context_json: eventContext });
  db.exec(readFileSync(new URL("../drizzle/0035_single_hiring_pipeline.sql", import.meta.url), "utf8"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(db.prepare("SELECT count(*) n FROM hiring_pipeline_versions").get().n, 1);
  assert.equal(db.prepare("SELECT pipeline_version_id FROM hiring_jobs WHERE id='existing-job'").get().pipeline_version_id, "current-published");
  const raw = db.prepare("SELECT * FROM hiring_applications WHERE id='existing-application'").get();
  assert.equal(raw.pipeline_version_id, "current-published");
  assert.equal(raw.stage_id, "previous-screening");
  assert.equal(raw.revision, 1);
  assert.equal(db.prepare("SELECT published_json FROM workflows WHERE id='existing-routing'").get().published_json, snapshot);
  assert.equal(db.prepare("SELECT context_json FROM hiring_events WHERE id='existing-event'").get().context_json, eventContext);
  const config = await service.hiringConfiguration(f.owner);
  assert.equal(config.versions.length, 1);
  assert(config.versions[0].definition.stages.some((s) => s.id === "previous-screening"));
  assert.equal(config.pipelineReferences["old-published"], "current-published");
  const started = await interviews.startApplicationInterview(f.owner, "retained-interview-app", { expectedRevision: 1, mutationId: "retained-interview-start" });
  assert(started.process.stageOptions.some((s) => s.id === "previous-interview"));
  assert.equal(started.process.applicationStage.id, "previous-interview");
  const updated = await service.savePipeline(f.owner, "existing-pipeline", { action: "publish", name: "Engineering", definition: config.pipelines[0].draft, expectedRevision: config.pipelines[0].revision });
  assert.equal(updated.versions.length, 1);
  assert.equal(updated.versions[0].id, "current-published");
  const w = await workflow.getWorkflow(f.owner, "existing-routing");
  assert.equal(w.draft.nodes[0].config.pipelineVersionId, "current-published");
  await drain();
  assert.equal((await service.getApplication(f.owner, "existing-application")).stageId, "screening");
  assert.equal(db.prepare("SELECT count(*) n FROM workflow_runs WHERE event_id='existing-event'").get().n, 1);
  // Retained Telegram snapshots can also resolve their old pipeline ID.
  const p = config.pipelines[0];
  const telegram = await publishedCvRouting(f, p, { fromStageId: "screening", stageId: "recruiter" });
  const legacyCvGraph = structuredClone(telegram.published);
  legacyCvGraph.nodes.find((n) => n.id === "move").config.pipelineVersionId = "old-published";
  db.prepare("UPDATE workflows SET published_json=? WHERE id=?").run(JSON.stringify(legacyCvGraph), telegram.id);
  const id = await reviewedCvRouting(f, telegram);
  await runner.processWorkflowRun(id);
  const run = await workflow.getRun(f.owner, id);
  assert.equal(run.status, "completed", run.errorMessage);
  assert.equal((await service.getApplication(f.owner, "existing-application")).stageId, "recruiter");
});

test("manual and automated stage moves require actual evidence; custom stages never mark approval", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  f.db
    .prepare("UPDATE resumes SET verification_status='unverified' WHERE id=?")
    .run(f.resumeId);
  let app = await application(f, p);
  app = await mutate(f, app, { action: "move", stageId: "screening" });
  assert.equal(
    (await service.applicationFacts(f.owner, app)).cv_approved,
    false,
  );
  await rejects(mutate(f, app, { action: "move", stageId: "technical" }), 422);
  const current = await workflow.createWorkflow(f.owner, "stage_entered");
  const graph = graphs.applicationGraph("stage_entered");
  graph.nodes[0].config = {
    trigger: "stage_entered",
    pipelineVersionId: p.currentVersionId,
    stageId: "screening",
  };
  graph.nodes[1].config = { fromStageId: "screening", stageId: "technical" };
  await workflow.saveWorkflow(f.owner, current.id, {
    action: "publish",
    name: "Try gated move",
    graph,
    expectedUpdatedAt: current.updatedAt,
  });
  await drain();
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "screening",
  );
  assert.match(
    f.db
      .prepare(
        "SELECT error_message FROM workflow_runs WHERE event_id IS NOT NULL",
      )
      .get().error_message,
    /approved/,
  );
  assert.equal(
    f.db
      .prepare("SELECT verification_status FROM resumes WHERE id=?")
      .get(f.resumeId).verification_status,
    "unverified",
  );
});
test("received application routes by structured job; retries and duplicate dispatch never move twice", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    job = await service.saveJob(f.owner, {
      title: "Frontend Developer",
      pipelineVersionId: p.currentVersionId,
    });
  const w = await routing(f, p, {
    condition: { field: "jobId", value: job.id },
  });
  const request = {
    candidateId: f.candidateId,
    resumeId: f.resumeId,
    jobId: job.id,
    mutationId: crypto.randomUUID(),
  };
  const app = await service.createApplication(f.owner, request);
  assert.equal((await service.createApplication(f.owner, request)).id, app.id);
  await drain();
  await drain();
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "screening",
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM workflow_runs WHERE workflow_id=?")
      .get(w.id).n,
    1,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_events WHERE kind='stage_entered'",
      )
      .get().n,
    1,
  );
  await rejects(
    service.createApplication(f.owner, { ...request, resumeId: "other" }),
    409,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM account_activations").get().n,
    0,
  );
});
test("missing job remains in the inbox and routes after explicit assignment", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    job = await service.saveJob(f.owner, {
      title: "Frontend Developer",
      pipelineVersionId: p.currentVersionId,
    });
  await routing(f, p, {
    trigger: "job_assigned",
    condition: { field: "jobId", value: job.id },
  });
  let app = await application(f, p);
  await drain();
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "applied",
  );
  app = await mutate(f, app, {
    action: "assign_job",
    jobId: job.id,
    stageId: "applied",
  });
  await drain();
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "screening",
  );
});
test("two job applications keep separate stages, form requirements and interview processes", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  const job1 = await service.saveJob(f.owner, {
      title: "Frontend",
      pipelineVersionId: p.currentVersionId,
    }),
    job2 = await service.saveJob(f.owner, {
      title: "Backend",
      pipelineVersionId: p.currentVersionId,
    });
  let a = await application(f, p, job1.id),
    b = await application(f, p, job2.id);
  a = await mutate(f, a, { action: "move", stageId: "technical" });
  assert.equal(b.stageId, "applied");
  assert.equal(
    (await service.applicationFacts(f.owner, a)).forms_accepted,
    false,
  );
  assert.equal(
    (await service.applicationFacts(f.owner, b)).forms_accepted,
    false,
  );
  const first = await interviews.startApplicationInterview(f.owner, a.id, {
    expectedRevision: a.revision,
    mutationId: crypto.randomUUID(),
  });
  b = await mutate(f, b, { action: "move", stageId: "technical" });
  const second = await interviews.startApplicationInterview(f.owner, b.id, {
    expectedRevision: b.revision,
    mutationId: crypto.randomUUID(),
  });
  assert.notEqual(first.process.id, second.process.id);
  assert.equal(first.process.snapshot.forms.length, 0);
  assert.equal(first.process.snapshot.contextKind, "approved_cv");
  assert.equal(first.process.applicationId, a.id);
  assert.equal(
    (await preparation.detailProgress(f.owner, f.candidateId)).interview,
    undefined,
  );
});
test("stale updates and a concurrent approval change abort all stage and history writes", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    app = await application(f, p);
  const current = await mutate(f, app, {
    action: "move",
    stageId: "screening",
  });
  await rejects(mutate(f, app, { action: "move", stageId: "documents" }), 409);
  const before = f.db.prepare("SELECT count(*) n FROM hiring_events").get().n;
  const original = runtime.DB.batch.bind(runtime.DB);
  let changed = false;
  runtime.DB.batch = async (statements) => {
    if (!changed) {
      changed = true;
      f.db
        .prepare(
          "UPDATE resumes SET verification_status='unverified' WHERE id=?",
        )
        .run(f.resumeId);
    }
    return original(statements);
  };
  await rejects(
    mutate(f, current, { action: "move", stageId: "technical" }),
    409,
  );
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "screening",
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM hiring_events").get().n,
    before,
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_guards").get().n, 0);
});
test("cross-workflow stage loops stop with a visible failure", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await routing(f, p);
  await routing(f, p, {
    trigger: "stage_entered",
    stage: "screening",
    from: "screening",
    to: "applied",
  });
  await routing(f, p, {
    trigger: "stage_entered",
    stage: "applied",
    from: "applied",
    to: "screening",
  });
  const app = await application(f, p);
  for (let i = 0; i < 6; i++) await drain();
  assert.ok(
    f.db
      .prepare(
        "SELECT count(*) n FROM workflow_runs WHERE error_message LIKE '%loop stopped%'",
      )
      .get().n > 0,
  );
  assert.ok((await service.getApplication(f.owner, app.id)).revision <= 5);
});
test("automation rejects foreign stage references and direct CV/manual execution of application workflows", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  const w = await workflow.createWorkflow(f.owner, "application_received"),
    graph = graphs.applicationGraph("application_received");
  graph.nodes[0].config.pipelineVersionId = p.currentVersionId;
  graph.nodes[1].config = { fromStageId: "applied", stageId: "foreign-stage" };
  await rejects(
    workflow.saveWorkflow(f.owner, w.id, {
      action: "publish",
      name: "Bad stage",
      graph,
      expectedUpdatedAt: w.updatedAt,
    }),
    422,
  );
  const active = await routing(f, p);
  await rejects(workflow.startWorkflow(f.owner, active.id, f.resumeId), 422);
  await rejects(
    service.createApplication("other@owner.test", {
      candidateId: f.candidateId,
      resumeId: f.resumeId,
      pipelineVersionId: p.currentVersionId,
      mutationId: crypto.randomUUID(),
    }),
    422,
  );
  const app = await application(f, p);
  await rejects(service.getApplication("other@owner.test", app.id), 404);
  assert.equal(
    (await service.listApplications("other@owner.test", new URLSearchParams()))
      .total,
    0,
  );
});
test("default inbox creates one application per new candidate; CV approvals emit events but CV updates do not", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await service.savePipeline(f.owner, p.id, {
    action: "default",
    expectedRevision: p.revision,
  });
  const newer = seedAcceptedPreparation(f.db, "b", f.owner);
  let app = f.db
    .prepare("SELECT * FROM hiring_applications WHERE candidate_id=?")
    .get(newer.candidateId);
  assert.ok(app);
  insertFixture(f.db, "resumes", {
    id: "extra-cv",
    owner_email: f.owner,
    candidate_id: newer.candidateId,
    file_key: "extra",
    checksum: "extra",
  });
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_applications WHERE candidate_id=?",
      )
      .get(newer.candidateId).n,
    1,
  );
  f.db
    .prepare("UPDATE resumes SET verification_status='unverified' WHERE id=?")
    .run(newer.resumeId);
  f.db
    .prepare("UPDATE resumes SET verification_status='verified' WHERE id=?")
    .run(newer.resumeId);
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_events WHERE kind='application_cv_approved'",
      )
      .get().n,
    1,
  );
  insertFixture(f.db, "candidate_cv_updates", {
    resume_id: "extra-cv",
    base_resume_id: newer.resumeId,
    owner_email: f.owner,
    candidate_id: newer.candidateId,
    status: "reviewing",
  });
  f.db
    .prepare(
      "UPDATE resumes SET verification_status='verified' WHERE id='extra-cv'",
    )
    .run();
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_events WHERE kind='application_cv_approved'",
      )
      .get().n,
    1,
  );
});
test("legacy import preserves evidence and emits no automation; protected CVs report a useful deletion blocker", async (t) => {
  const f = fixture(t);
  const preview = await service.legacyPreview(f.owner);
  assert.equal(preview.items.length, 1);
  await service.importLegacy(f.owner, { items: preview.items });
  assert.equal(
    f.db.prepare("SELECT stage_id FROM hiring_applications").get().stage_id,
    "accepted",
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM workflow_runs").get().n, 0);
  assert.equal((await service.legacyPreview(f.owner)).items.length, 0);
  assert.match(
    await archive.deletionBlocker(f.owner, "resume", f.resumeId),
    /hiring application/,
  );
});
test("recorded offer acceptance and an explicit hiring decision are separate from stage moves", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  let app = await application(f, p);
  app = await mutate(f, app, { action: "move", stageId: "offer" });
  await rejects(
    mutate(f, app, {
      action: "close",
      outcome: "hired",
      reason: "Owner approved hire",
    }),
    422,
  );
  app = await mutate(f, app, {
    action: "offer",
    offer: "accepted",
    reason: "Candidate accepted the offer",
  });
  assert.equal(app.outcome, null);
  app = await mutate(f, app, {
    action: "close",
    outcome: "hired",
    reason: "Owner approved hire",
  });
  assert.equal(app.outcome, "hired");
  await rejects(
    mutate(f, app, {
      action: "move",
      stageId: "screening",
      reason: "Revisit application",
    }),
    409,
  );
});
test("explicit test-data reset includes application dependencies and can retain hiring definitions", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await application(f, p);
  const choice = { scope: "candidates", keepDefinitions: true },
    preview = await reset.previewTestDataReset(f.owner, choice);
  assert.ok(
    preview.counts.some(
      (v) => v.table === "hiring_applications" && v.count === 1,
    ),
  );
  assert.equal(preview.blockers.length, 0);
  await reset.executeTestDataReset(
    f.owner,
    choice,
    preview.revision,
    "DELETE TEST DATA",
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM hiring_applications").get().n,
    0,
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events").get().n, 0);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM hiring_pipelines").get().n,
    1,
  );
});
test("a committed stage move survives a lost execution checkpoint without repeating the transition", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await routing(f, p);
  const app = await application(f, p);
  await automation.dispatchApplicationEvents();
  const run = f.db
    .prepare("SELECT id FROM workflow_runs WHERE application_id=?")
    .get(app.id);
  const real = runtime.DB.batch.bind(runtime.DB);
  let lost = false;
  runtime.DB.batch = async (statements) => {
    if (
      !lost &&
      statements.some((s) =>
        s.query?.startsWith("UPDATE hiring_applications SET"),
      )
    ) {
      await real(statements);
      lost = true;
      throw new Error("Simulated lost checkpoint");
    }
    return real(statements);
  };
  await runner.processWorkflowRun(run.id);
  assert.equal((await service.getApplication(f.owner, app.id)).revision, 2);
  runtime.DB.batch = real;
  f.db
    .prepare("UPDATE workflow_runs SET status='queued' WHERE id=?")
    .run(run.id);
  await runner.processWorkflowRun(run.id);
  assert.equal(
    f.db.prepare("SELECT status FROM workflow_runs WHERE id=?").get(run.id)
      .status,
    "completed",
  );
  assert.equal((await service.getApplication(f.owner, app.id)).revision, 2);
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_events WHERE application_id=? AND kind='stage_entered'",
      )
      .get(app.id).n,
    1,
  );
});
test("real later stage entries have new event identities while the same event keeps its published graph", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    w = await routing(f, p, {
      trigger: "stage_entered",
      stage: "screening",
      from: "screening",
      to: "documents",
    });
  let app = await application(f, p);
  app = await mutate(f, app, { action: "move", stageId: "screening" });
  await automation.dispatchApplicationEvents();
  const run = f.db
    .prepare("SELECT id,version FROM workflow_runs WHERE workflow_id=?")
    .get(w.id);
  const edited = structuredClone(w.draft);
  edited.nodes.find((n) => n.kind === "move_stage").config.stageId = "offer";
  await workflow.saveWorkflow(f.owner, w.id, {
    action: "publish",
    name: w.name,
    graph: edited,
    expectedUpdatedAt: w.updatedAt,
  });
  await runner.processWorkflowRun(run.id);
  app = await service.getApplication(f.owner, app.id);
  assert.equal(app.stageId, "documents");
  app = await mutate(f, app, {
    action: "move",
    stageId: "screening",
    reason: "Owner requests another review",
  });
  await drain();
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "offer",
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM workflow_runs WHERE workflow_id=?")
      .get(w.id).n,
    2,
  );
});
test("an explicit approved CV selection preserves original interview evidence and starts no approval automation", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    job = await service.saveJob(f.owner, {
      title: "Frontend",
      pipelineVersionId: p.currentVersionId,
    });
  let app = await application(f, p, job.id);
  app = await mutate(f, app, { action: "move", stageId: "technical" });
  const interview = await interviews.startApplicationInterview(
    f.owner,
    app.id,
    { expectedRevision: app.revision, mutationId: crypto.randomUUID() },
  );
  app = await service.getApplication(f.owner, app.id);
  insertFixture(f.db, "resumes", {
    id: "updated-cv",
    owner_email: f.owner,
    candidate_id: f.candidateId,
    file_name: "TEST updated CV.pdf",
    file_key: "updated-file",
    checksum: "updated-checksum",
    verification_status: "unverified",
  });
  await rejects(
    mutate(f, app, {
      action: "change_cv",
      resumeId: "updated-cv",
      confirmReuse: true,
      reason: "Use the approved update",
    }),
    422,
  );
  f.db
    .prepare(
      "UPDATE resumes SET verification_status='verified' WHERE id='updated-cv'",
    )
    .run();
  insertFixture(f.db, "candidate_profile_versions", {
    id: "updated-profile",
    owner_email: f.owner,
    candidate_id: f.candidateId,
    resume_id: "updated-cv",
    version_number: 2,
    verification_status: "verified",
    created_by_email: f.owner,
  });
  const moved = await mutate(f, app, {
    action: "change_cv",
    resumeId: "updated-cv",
    confirmReuse: true,
    reason: "Use the approved update",
  });
  assert.equal(moved.resumeId, "updated-cv");
  assert.equal(
    f.db
      .prepare("SELECT resume_id FROM interview_processes WHERE id=?")
      .get(interview.process.id).resume_id,
    f.resumeId,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_events WHERE kind='application_cv_approved'",
      )
      .get().n,
    0,
  );
  const protections = await vite.ssrLoadModule(
    "/features/candidate-progress/cv-updates.server.ts",
  );
  assert.equal(await protections.cvIsProtected(f.owner, "updated-cv"), true);
});
test("hiring APIs require a real owner session and reject forged identity and cross-origin writes", async (t) => {
  const f = fixture(t),
    routes = await vite.ssrLoadModule("/app/api/hiring/pipelines/route.ts");
  assert.equal(
    (
      await routes.GET(
        new Request("http://localhost:5173/api/hiring/pipelines", {
          headers: { "x-owner-email": f.owner },
        }),
      )
    ).status,
    401,
  );
  const auth = await vite.ssrLoadModule("/lib/auth.ts");
  const response = await auth.getAuth().handler(
    new Request("http://localhost:5173/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
        "x-pdf-builder-bootstrap": runtime.AUTH_BOOTSTRAP_TOKEN,
      },
      body: JSON.stringify({
        name: "TEST Hiring Owner",
        email: f.owner,
        password: "local-hiring-test-password",
      }),
    }),
  );
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const allowed = await routes.GET(
    new Request("http://localhost:5173/api/hiring/pipelines", {
      headers: { cookie },
    }),
  );
  assert.equal(allowed.status, 200);
  const rejected = await routes.POST(
    new Request("http://localhost:5173/api/hiring/pipelines", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://other.invalid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Unexpected pipeline" }),
    }),
  );
  assert.equal(rejected.status, 403);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM hiring_pipelines").get().n,
    0,
  );
});

test("application background processing cannot resume an unrelated preparation run", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await routing(f, p);
  const app = await application(f, p);
  const legacy = await workflow.createWorkflow(f.owner, "staff_upload");
  insertFixture(f.db, "workflow_runs", {
    id: "legacy-queued",
    workflow_id: legacy.id,
    owner_email: f.owner,
    workflow_name: "TEST queued preparation",
    version: 1,
    resume_id: f.resumeId,
    graph_json: JSON.stringify({
      nodes: [
        { id: "done", kind: "complete", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [],
    }),
    current_node_id: "done",
    status: "queued",
  });
  await automation.dispatchApplicationEvents();
  await runner.processPendingWorkflowRuns({ applicationOnly: true });
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "screening",
  );
  assert.equal(
    f.db
      .prepare("SELECT status FROM workflow_runs WHERE id='legacy-queued'")
      .get().status,
    "queued",
  );
  await runner.processPendingWorkflowRuns();
  assert.equal(
    f.db
      .prepare("SELECT status FROM workflow_runs WHERE id='legacy-queued'")
      .get().status,
    "completed",
  );
});

async function ownerCookie(f, apiVite = vite) {
  const auth = await apiVite.ssrLoadModule("/lib/auth.ts");
  const response = await auth.getAuth().handler(
    new Request("http://localhost:5173/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:5173",
        "x-pdf-builder-bootstrap": runtime.AUTH_BOOTSTRAP_TOKEN,
      },
      body: JSON.stringify({
        name: "TEST Unified Owner",
        email: f.owner,
        password: "local-hiring-test-password",
      }),
    }),
  );
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}
async function publishedPreparation(f) {
  f.db
    .prepare("UPDATE template_versions SET roles_json=? WHERE id=?")
    .run(
      JSON.stringify([
        { id: "form_user", name: "Form user", color: "#2563eb" },
      ]),
      f.versionId,
    );
  const w = await workflow.createWorkflow(f.owner, "manual"),
    graph = graphs.defaultGraph();
  graph.nodes.find((n) => n.kind === "assign_forms").config.forms = [
    { templateId: f.templateId, roleId: "form_user" },
  ];
  return workflow.saveWorkflow(f.owner, w.id, {
    action: "publish",
    name: "TEST Application preparation",
    graph,
    expectedUpdatedAt: w.updatedAt,
  });
}
function validProfile(f) {
  return vite
    .ssrLoadModule("/features/resumes/candidate-profile.ts")
    .then((model) => {
      const profile = model.candidateProfileFromSummary({
        fullName: "TEST Candidate",
        email: "a@candidate.test",
        phone: "",
        address: "",
        dateOfBirth: null,
        gender: "",
        nationality: "",
        currentTitle: "",
        professionalSummary: "",
        skills: [],
        workExperience: [],
        education: [],
        certifications: [],
        languages: [],
        links: [],
      });
      f.db
        .prepare(
          "UPDATE candidate_profile_versions SET profile_json=? WHERE id=?",
        )
        .run(JSON.stringify(profile), f.profileId);
      return profile;
    });
}

test("application assignments keep the same account/template separate, retry safely and scope correction review", async (t) => {
  const apiVite = await createServer({
    appType: "custom",
    configFile: false,
    root,
    resolve: {
      alias: {
        "@": root,
        "server-only": root + "/tests/helpers/server-only.mjs",
        "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs",
      },
    },
    server: { middlewareMode: true, hmr: false },
  });
  t.after(() => apiVite.close());
  const f = fixture(t),
    p = await pipeline(f);
  await validProfile(f);
  f.db
    .prepare("UPDATE template_versions SET roles_json=? WHERE id=?")
    .run(
      JSON.stringify([
        { id: "form_user", name: "Form user", color: "#2563eb" },
      ]),
      f.versionId,
    );
  const a = await application(f, p),
    b = await application(f, p),
    cookie = await ownerCookie(f, apiVite);
  const route = await apiVite.ssrLoadModule(
    "/app/api/accounts/[id]/assignments/route.ts",
  );
  async function assign(app, key, origin = "http://localhost:5173") {
    return route.POST(
      new Request(
        `http://localhost:5173/api/accounts/${f.userId}/assignments`,
        {
          method: "POST",
          headers: {
            cookie,
            origin,
            "content-type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            templateId: f.templateId,
            roleId: "form_user",
            applicationId: app.id,
            expectedApplicationRevision: app.revision,
          }),
        },
      ),
      { params: Promise.resolve({ id: f.userId }) },
    );
  }
  assert.equal(
    (await assign(a, "test-foreign-origin-key", "https://other.invalid"))
      .status,
    403,
  );
  const first = await assign(a, "test-application-a-key");
  assert.equal(first.status, 201, JSON.stringify(await first.clone().json()));
  const fa = (await first.json()).assignment;
  const second = await assign(b, "test-application-b-key");
  assert.equal(second.status, 201, JSON.stringify(await second.clone().json()));
  const fb = (await second.json()).assignment;
  assert.notEqual(fa.id, fb.id);
  const fillContext = await apiVite.ssrLoadModule(
    "/features/templates/fill-context.server.ts",
  );
  const legacyToken = "legacy-fill-regression-token-" + "a".repeat(20);
  const { hashRecipientToken } = await apiVite.ssrLoadModule(
    "/features/templates/template.server.ts",
  );
  f.db.prepare("UPDATE recipient_links SET token_hash=? WHERE id=?").run(
    await hashRecipientToken(legacyToken),
    f.linkId,
  );
  assert.equal(
    (await fillContext.findFillContext(legacyToken)).assignment.id,
    f.assignmentId,
    "Legacy nullable application scope must not nullify the joined assignment",
  );
  assert.equal(
    (await fillContext.findFillContext(`assigned_${fa.id}`)).assignment.id,
    fa.id,
  );
  assert.equal((await assign(a, "test-application-a-key")).status, 200);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM form_assignments").get().n,
    3,
  );
  assert.deepEqual(
    (await service.getApplication(f.owner, a.id)).evidence.assignments,
    [fa.id],
  );
  assert.deepEqual(
    (await service.getApplication(f.owner, b.id)).evidence.assignments,
    [fb.id],
  );
  const link = f.db
    .prepare("SELECT recipient_link_id id FROM form_assignments WHERE id=?")
    .get(fa.id).id;
  insertFixture(f.db, "submissions", {
    id: "scoped-submission",
    template_id: f.templateId,
    template_version_id: f.versionId,
    recipient_link_id: link,
    values_json: "[]",
  });
  f.db
    .prepare("UPDATE form_assignments SET status='completed' WHERE id=?")
    .run(fa.id);
  f.db
    .prepare("UPDATE recipient_links SET status='completed' WHERE id=?")
    .run(link);
  const reviews = await apiVite.ssrLoadModule("/features/hr/review.server.ts");
  const result = await reviews.reviewSubmission(
    new Request(
      "http://localhost:5173/api/submissions/scoped-submission/review",
      {
        method: "POST",
        headers: {
          cookie,
          origin: "http://localhost:5173",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "request_corrections",
          expectedRevision: "",
          reason: "Please correct the job-specific answer.",
        }),
      },
    ),
    "scoped-submission",
  );
  assert.equal(result.status, 200);
  assert.notEqual(
    f.db
      .prepare("SELECT recipient_link_id id FROM form_assignments WHERE id=?")
      .get(fa.id).id,
    link,
  );
  assert.equal(
    f.db.prepare("SELECT status FROM form_assignments WHERE id=?").get(fb.id)
      .status,
    "assigned",
  );
  assert.equal(
    f.db
      .prepare("SELECT status FROM form_assignments WHERE id=?")
      .get(f.assignmentId).status,
    "completed",
  );
  await reviews.reviewDetail(f.owner, "scoped-submission");
});

test("application preparation pins its graph, waits for review, deduplicates and stays out of legacy selection", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    app = await application(f, p),
    w = await publishedPreparation(f);
  const request = {
    workflowId: w.id,
    expectedRevision: app.revision,
    confirmIndependent: true,
  };
  const first = await applicationPreparation.startApplicationPreparation(
    f.owner,
    app.id,
    request,
  );
  assert.equal(
    (
      await applicationPreparation.startApplicationPreparation(
        f.owner,
        app.id,
        request,
      )
    ).runId,
    first.runId,
  );
  await runner.processWorkflowRun(first.runId);
  const run = await workflow.getRun(f.owner, first.runId);
  assert.equal(run.status, "waiting_review");
  assert.equal(run.version, w.version);
  assert.equal(
    f.db
      .prepare("SELECT application_id FROM workflow_runs WHERE id=?")
      .get(first.runId).application_id,
    app.id,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM hiring_preparations").get().n,
    1,
  );
  assert.equal(
    (await service.getApplication(f.owner, app.id)).evidence.preparationMode,
    "application",
  );
  assert.equal(
    (await preparation.detailProgress(f.owner, f.candidateId)).run,
    null,
  );
  await rejects(
    applicationPreparation.applicationPreparation("foreign@owner.test", app.id),
    404,
  );
  const fresh = await service.getApplication(f.owner, app.id);
  await mutate(f, fresh, {
    action: "hold",
    reason: "Wait for candidate availability",
  });
  const reviewService = await vite.ssrLoadModule(
    "/features/workflows/review.server.ts",
  );
  await rejects(
    reviewService.reviewRun(f.owner, first.runId, {
      action: "reject",
      note: "Review cannot proceed while this application is on hold.",
    }),
    409,
  );
  const lease = await workflow.claimRun(first.runId, ["waiting_review"]);
  f.db
    .prepare("UPDATE workflow_runs SET status='running' WHERE id=?")
    .run(first.runId);
  assert.throws(
    () =>
      f.db
        .prepare("INSERT INTO workflow_execution_guards VALUES(?,?,?)")
        .run(first.runId, lease.token, "2030-01-02T00:00:00.000Z"),
    /WORKFLOW_LEASE_CHANGED/,
  );
});

test("application preparation mode excludes future legacy CV-approval rules without changing published graphs", async (t) => {
  const f = fixture(t),
    p = await pipeline(f, {
      ...model.initialDefinition(),
      preparationMode: "legacy",
    });
  let app = await application(f, p);
  const w = await publishedPreparation(f);
  const graph = w.published;
  graph.nodes[0].config.trigger = "resume_verified";
  await workflow.saveWorkflow(f.owner, w.id, {
    action: "publish",
    name: w.name,
    graph,
    expectedUpdatedAt: w.updatedAt,
  });
  const plans = await vite.ssrLoadModule(
    "/features/resumes/approval-plan.server.ts",
  );
  const before = (
    await plans.approvalPlan(
      f.owner,
      f.resumeId,
      f.candidateId,
      "a@candidate.test",
    )
  ).plan;
  assert.equal(before.workflows.length, 1);
  app = await mutate(f, app, {
    action: "preparation_mode",
    mode: "application",
    confirmCutover: true,
    reason: "Use application preparation for this job",
  });
  const after = (
    await plans.approvalPlan(
      f.owner,
      f.resumeId,
      f.candidateId,
      "a@candidate.test",
    )
  ).plan;
  assert.equal(after.workflows.length, 0);
  assert.equal(
    (
      await workflow.uploadWorkflowStatements(
        f.owner,
        f.resumeId,
        "2030-01-02T00:00:00.000Z",
        "resume_verified",
      )
    ).length,
    0,
  );
  const currentGraph = (await workflow.getWorkflow(f.owner, w.id)).published;
  insertFixture(f.db, "workflow_runs", {
    id: "late-legacy-approval",
    workflow_id: w.id,
    owner_email: f.owner,
    resume_id: f.resumeId,
    graph_json: JSON.stringify(currentGraph),
    context_json: '{"steps":{}}',
    current_node_id: "start",
  });
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM workflow_runs WHERE id='late-legacy-approval'",
      )
      .get().n,
    0,
  );
  assert.equal((await workflow.getWorkflow(f.owner, w.id)).active, true);
  assert.equal(app.evidence.preparationMode, "application");
});

test("rounds satisfy only their mapped interview stage and holds block direct interview writes", async (t) => {
  const f = fixture(t),
    definition = model.initialDefinition();
  const recruiter = definition.stages.find((s) => s.id === "recruiter");
  recruiter.activity = "interview";
  recruiter.interviewScope = "stage";
  recruiter.exit = ["interview_complete"];
  const technical = definition.stages.find((s) => s.id === "technical");
  technical.interviewScope = "stage";
  technical.exit = ["interview_complete"];
  const p = await pipeline(f, definition),
    job = await service.saveJob(f.owner, {
      title: "Frontend",
      pipelineVersionId: p.currentVersionId,
    });
  let app = await application(f, p, job.id);
  app = await mutate(f, app, { action: "move", stageId: "recruiter" });
  let process = (
    await interviews.startApplicationInterview(f.owner, app.id, {
      expectedRevision: app.revision,
      mutationId: crypto.randomUUID(),
    })
  ).process;
  const change = async (values) =>
    (
      await interviewService.mutateInterview(f.owner, process.id, {
        mutationId: crypto.randomUUID(),
        expectedVersion: process.version,
        ...values,
      })
    ).process;
  process = await change({
    action: "schedule",
    name: "Recruiter call",
    interviewers: ["HR"],
    appointment: {
      localDateTime: "2030-01-03T10:00",
      timezone: "Asia/Phnom_Penh",
      duration: 30,
      kind: "online",
      location: "https://meet.example.test/recruiter",
      notes: "",
    },
  });
  assert.equal(process.rounds[0].stageId, "recruiter");
  const upcoming = await service.listApplications(
    f.owner,
    new URLSearchParams({ queue: "upcoming" }),
  );
  assert.equal(upcoming.total, 1);
  assert.equal(upcoming.items[0].nextAppointmentTimezone, "Asia/Phnom_Penh");
  assert.equal(upcoming.items[0].nextTask.label, "View scheduled interview");
  await rejects(
    mutate(f, await service.getApplication(f.owner, app.id), {
      action: "close",
      outcome: "rejected",
      reason: "Resolve the upcoming appointment first",
    }),
    409,
  );
  app = await service.getApplication(f.owner, app.id);
  await rejects(mutate(f, app, { action: "move", stageId: "technical" }), 422);
  t.mock.timers.setTime(Date.UTC(2030, 0, 3, 4));
  process = await change({ action: "complete", roundId: process.rounds[0].id });
  process = await change({
    action: "feedback",
    roundId: process.rounds[0].id,
    interviewer: "HR",
    status: "submitted",
    scorecard: {
      ratings: [4, 4, 4, 4],
      notes: "Discussed role experience",
      strengths: "Relevant examples",
      concerns: "No additional concerns",
      recommendation: "proceed",
    },
  });
  assert.ok(
    f.db
      .prepare(
        "SELECT id FROM hiring_events WHERE kind='application_interview_ready' AND application_id=?",
      )
      .get(app.id),
  );
  app = await mutate(f, app, { action: "move", stageId: "technical" });
  assert.equal(
    (await service.applicationFacts(f.owner, app)).interview_complete,
    false,
  );
  await rejects(mutate(f, app, { action: "move", stageId: "documents" }), 422);
  app = await mutate(f, app, {
    action: "hold",
    reason: "Waiting for technical interviewer availability",
  });
  await rejects(
    change({
      action: "schedule",
      name: "Technical interview",
      interviewers: ["Engineer"],
      appointment: {
        localDateTime: "2030-01-04T10:00",
        timezone: "Asia/Phnom_Penh",
        duration: 30,
        kind: "online",
        location: "https://meet.example.test/technical",
        notes: "",
      },
    }),
    409,
  );
});

test("legacy review discovers archived and CV-less records; adoption preserves history and emits no workflow events", async (t) => {
  const f = fixture(t);
  insertFixture(f.db, "archive_records", {
    id: "archived-cv-record",
    owner_email: f.owner,
    entity_type: "resume",
    entity_id: f.resumeId,
    archived_by: f.owner,
  });
  insertFixture(f.db, "candidates", {
    id: "no-cv-candidate",
    owner_email: f.owner,
    full_name: "TEST Missing CV",
    email: "missing@candidate.test",
  });
  const inventory = await legacyWorkspace.legacyInventory(
    f.owner,
    new URLSearchParams(),
  );
  assert.equal(inventory.total, 2);
  assert.equal(
    inventory.items.find((i) => i.id === "no-cv-candidate").canAdopt,
    false,
  );
  const row = inventory.items.find((i) => i.id === f.candidateId);
  assert.equal(row.archived, true);
  const result = await legacyWorkspace.adoptLegacy(f.owner, {
    candidateId: f.candidateId,
    expectedRevision: row.expectedRevision,
    confirmAdoption: true,
    stageId: "approved",
    mappingReason: "Map the retained approved CV to its original review state.",
  });
  assert.equal(
    (await service.getApplication(f.owner, result.applicationId)).resumeId,
    f.resumeId,
  );
  assert.equal(f.db.prepare("SELECT count(*) n FROM hiring_events").get().n, 0);
  assert.equal(f.db.prepare("SELECT count(*) n FROM workflow_runs").get().n, 0);
  assert.equal(
    (await legacyWorkspace.adoptLegacy(f.owner, { candidateId: f.candidateId }))
      .applicationId,
    result.applicationId,
  );
});

test("application sorting happens before pagination and puts unknown stage starts last", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  const apps = [];
  for (let i = 0; i < 53; i++) {
    const app = await application(f, p);
    apps.push(app);
    f.db
      .prepare(
        "UPDATE hiring_applications SET stage_entered_at=?,created_at=? WHERE id=?",
      )
      .run(
        "2026-06-01T00:00:00.000Z",
        new Date(Date.UTC(2024, 0, i + 1)).toISOString(),
        app.id,
      );
  }
  f.db
    .prepare("UPDATE hiring_applications SET stage_entered_at=? WHERE id=?")
    .run("2025-01-01T00:00:00.000Z", apps[0].id);
  f.db
    .prepare("UPDATE hiring_applications SET stage_entered_at=? WHERE id=?")
    .run("2026-01-01T00:00:00.000Z", apps[1].id);
  f.db
    .prepare("UPDATE hiring_applications SET stage_entered_at=NULL WHERE id=?")
    .run(apps[2].id);
  f.db
    .prepare(
      "UPDATE hiring_applications SET stage_entered_at='unknown' WHERE id=?",
    )
    .run(apps[3].id);
  const first = await service.listApplications(
    f.owner,
    new URLSearchParams({ sort: "waiting" }),
  );
  const second = await service.listApplications(
    f.owner,
    new URLSearchParams({ sort: "waiting", page: "2" }),
  );
  assert.equal(first.total, 53);
  assert.equal(first.items.length, 50);
  assert.deepEqual(
    first.items.slice(0, 2).map((app) => app.id),
    [apps[0].id, apps[1].id],
  );
  assert.deepEqual(
    new Set(second.items.slice(-2).map((app) => app.id)),
    new Set([apps[2].id, apps[3].id]),
  );
  assert.equal(
    new Set([...first.items, ...second.items].map((app) => app.id)).size,
    53,
  );
  const newest = await service.listApplications(
    f.owner,
    new URLSearchParams({ sort: "newest" }),
  );
  assert.equal(newest.items[0].id, apps[52].id);
  const fallback = await service.listApplications(
    f.owner,
    new URLSearchParams({ sort: "a.id; DROP TABLE hiring_applications" }),
  );
  const recent = await service.listApplications(f.owner, new URLSearchParams());
  assert.deepEqual(
    fallback.items.map((app) => app.id),
    recent.items.map((app) => app.id),
  );
});

test("application labels preserve outcomes and handle unknown stage dates and appointment timezones", () => {
  assert.equal(
    presentation.applicationStatusLabel({ outcome: "rejected", hold: null }),
    "Not selected",
  );
  assert.equal(
    presentation.applicationStatusLabel({ outcome: "hired", hold: "Old hold" }),
    "Hired",
  );
  assert.equal(
    presentation.applicationStatusLabel({ outcome: null, hold: "Waiting" }),
    "On hold",
  );
  const now = Date.parse("2026-10-22T00:00:00Z");
  assert.equal(presentation.stageAgeLabel(null, now), "Stage start unknown");
  assert.equal(
    presentation.stageAgeLabel("unknown", now),
    "Stage start unknown",
  );
  assert.equal(
    presentation.stageAgeLabel("2026-10-22T01:00:00Z", now),
    "Today in stage",
  );
  assert.equal(
    presentation.stageAgeLabel("2026-10-21T00:00:00Z", now),
    "1 day in stage",
  );
  assert.equal(
    presentation.stageAgeLabel("2026-10-20T00:00:00Z", now),
    "2 days in stage",
  );
  assert.match(
    presentation.applicationAppointmentLabel(
      "2026-10-22T00:00:00Z",
      "Asia/Bangkok",
    ),
    /7:00 AM.*Asia\/Bangkok/,
  );
  assert.match(
    presentation.applicationAppointmentLabel(
      "2026-10-22T00:00:00Z",
      "invalid-timezone",
    ),
    /UTC/,
  );
  assert.equal(
    presentation.applicationAppointmentLabel("bad-date", "Asia/Bangkok"),
    "Interview time unavailable",
  );
});

test("application queues filter before pagination and keep appointment timezone and contextual tasks", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  const a = await application(f, p);
  for (let i = 0; i < 51; i++) await application(f, p);
  const first = await service.listApplications(
    f.owner,
    new URLSearchParams({ queue: "attention" }),
  );
  const second = await service.listApplications(
    f.owner,
    new URLSearchParams({ queue: "attention", page: "2" }),
  );
  assert.equal(first.total, 52);
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 2);
  assert.equal(first.items[0].nextTask.label, "Assign job");
  assert.equal(
    new Set([...first.items, ...second.items].map((i) => i.id)).size,
    52,
  );
  await mutate(f, a, {
    action: "hold",
    reason: "Awaiting candidate availability",
  });
  assert.equal(
    (
      await service.listApplications(
        f.owner,
        new URLSearchParams({ queue: "attention" }),
      )
    ).total,
    51,
  );
  assert.equal(
    (
      await service.listApplications(
        f.owner,
        new URLSearchParams({ queue: "paused" }),
      )
    ).total,
    1,
  );
});

test("two preparations reuse unchanged CV approval while producing independent answers and completed events", async (t) => {
  try {
    const f = fixture(t),
      p = await pipeline(f);
    await validProfile(f);
    f.db
      .prepare(
        "UPDATE candidates SET normalized_email=email,date_of_birth=NULL WHERE id=?",
      )
      .run(f.candidateId);
    const w = await publishedPreparation(f),
      a = await application(f, p),
      b = await application(f, p);
    const reviews = await vite.ssrLoadModule(
      "/features/workflows/review.server.ts",
    );
    for (const app of [a, b]) {
      const started = await applicationPreparation.startApplicationPreparation(
        f.owner,
        app.id,
        {
          workflowId: w.id,
          expectedRevision: app.revision,
          confirmIndependent: true,
        },
      );
      await runner.processWorkflowRun(started.runId);
      const data = await reviews.getReviewData(f.owner, started.runId);
      await rejects(
        reviews.reviewRun(f.owner, started.runId, {
          action: "approve",
          candidate: data.candidate,
          checks: [true, true, true],
          resumeRevision: data.resumeRevision,
          candidateRevision: data.candidateRevision,
        }),
        409,
      );
      await reviews.reviewRun(f.owner, started.runId, {
        action: "approve",
        candidate: data.candidate,
        checks: [true, true, true],
        resumeRevision: data.resumeRevision,
        candidateRevision: data.candidateRevision,
        existingAccountId: f.userId,
      });
      await runner.processWorkflowRun(started.runId);
      const run = await workflow.getRun(f.owner, started.runId);
      assert.equal(
        run.status,
        "completed",
        run.errorMessage ?? "Preparation must complete",
      );
      assert.equal(run.context.profileVersionId, f.profileId);
    }
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM candidate_profile_versions").get().n,
      1,
    );
    const aa = await service.getApplication(f.owner, a.id),
      bb = await service.getApplication(f.owner, b.id);
    assert.equal(aa.evidence.assignments.length, 1);
    assert.equal(bb.evidence.assignments.length, 1);
    assert.notEqual(aa.evidence.assignments[0], bb.evidence.assignments[0]);
    assert.equal(
      (await service.applicationFacts(f.owner, aa)).preparation_ready,
      true,
    );
    assert.equal(
      (await service.applicationFacts(f.owner, bb)).preparation_ready,
      true,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) n FROM hiring_events WHERE kind='application_preparation_completed'",
        )
        .get().n,
      2,
    );
    await runner.processWorkflowRun(aa.evidence.runId);
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM form_assignments").get().n,
      3,
    );
    insertFixture(f.db, "resumes", {
      id: "future-approved-cv",
      owner_email: f.owner,
      candidate_id: f.candidateId,
      file_name: "TEST Future CV.pdf",
      file_key: "resumes/a/future.pdf",
      checksum: "future-checksum",
      verification_status: "verified",
    });
    insertFixture(f.db, "candidate_profile_versions", {
      id: "future-approved-profile",
      owner_email: f.owner,
      candidate_id: f.candidateId,
      resume_id: "future-approved-cv",
      version_number: 2,
      verification_status: "verified",
      created_by_email: f.owner,
    });
    for (const prior of [aa, bb])
      await mutate(f, prior, {
        action: "change_cv",
        resumeId: "future-approved-cv",
        confirmReuse: true,
        reason: "Use the approved future CV and retain original form snapshots",
      });
    assert.match(
      await archive.deletionBlocker(f.owner, "resume", f.resumeId),
      /hiring application|workflow|history/,
    );
    const choice = { scope: "candidates", keepDefinitions: true },
      preview = await reset.previewTestDataReset(f.owner, choice);
    assert.equal(preview.blockers.length, 0);
    await reset.executeTestDataReset(
      f.owner,
      choice,
      preview.revision,
      "DELETE TEST DATA",
    );
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM hiring_preparations").get().n,
      0,
    );
    assert.equal(
      f.db.prepare("SELECT count(*) n FROM hiring_application_forms").get().n,
      0,
    );
  } catch (e) {
    if (e instanceof Response) throw new Error(await e.text());
    throw e;
  }
});

test("published application automation pins the child preparation version and retries cannot create another run", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    child = await publishedPreparation(f);
  let app = await application(f, p);
  app = await mutate(f, app, {
    action: "preparation_mode",
    mode: "application",
    confirmCutover: true,
    reason: "Application owns preparation for this CV",
  });
  const parent = await workflow.createWorkflow(f.owner, "stage_entered"),
    graph = graphs.applicationGraph("stage_entered");
  graph.nodes[0].config = {
    trigger: "stage_entered",
    pipelineVersionId: p.currentVersionId,
    stageId: "documents",
  };
  graph.nodes[1].kind = "prepare_application";
  graph.nodes[1].config = { preparationWorkflowId: child.id };
  const published = await workflow.saveWorkflow(f.owner, parent.id, {
    action: "publish",
    name: "Prepare after documents entry",
    expectedUpdatedAt: parent.updatedAt,
    graph,
  });
  assert.equal(
    published.published.nodes[1].config.preparationWorkflowVersion,
    1,
  );
  await workflow.saveWorkflow(f.owner, child.id, {
    action: "publish",
    name: "Later preparation version",
    graph: child.draft,
    expectedUpdatedAt: child.updatedAt,
  });
  app = await mutate(f, app, { action: "move", stageId: "documents" });
  await drain();
  await drain();
  const rows = f.db
    .prepare(
      "SELECT id,version,status FROM workflow_runs WHERE application_id=? AND event_id IS NULL",
    )
    .all(app.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, 1);
  assert.equal(rows[0].status, "waiting_review");
  await drain();
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM hiring_preparations").get().n,
    1,
  );
});

test("only the completed required set emits submitted/accepted routing events, with application-local evidence", async (t) => {
  const f = fixture(t),
    p = await pipeline(f),
    a = await application(f, p),
    b = await application(f, p);
  const put = (table, values) => insertFixture(f.db, table, values);
  for (const [app, n] of [
    [a, "one"],
    [b, "two"],
  ]) {
    put("recipient_links", {
      id: `${n}-link`,
      template_id: f.templateId,
      template_version_id: f.versionId,
      assigned_user_id: f.userId,
      role_id: "form_user",
      role_name: "Form user",
      role_color: "#2563eb",
      token_hash: `${n}-token`,
    });
    put("form_assignments", {
      id: `${n}-assignment`,
      application_id: app.id,
      user_id: f.userId,
      template_id: f.templateId,
      template_version_id: f.versionId,
      recipient_link_id: `${n}-link`,
      role_id: "form_user",
      role_name: "Form user",
      role_color: "#2563eb",
      status: "assigned",
      candidate_profile_version_id: f.profileId,
    });
  }
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM hiring_events WHERE kind LIKE 'application_forms_%'",
      )
      .get().n,
    0,
  );
  put("submissions", {
    id: "one-submission",
    template_id: f.templateId,
    template_version_id: f.versionId,
    recipient_link_id: "one-link",
    values_json: "[]",
  });
  f.db
    .prepare(
      "UPDATE form_assignments SET status='completed' WHERE id='one-assignment'",
    )
    .run();
  assert.equal(
    f.db
      .prepare(
        "SELECT application_id FROM hiring_events WHERE kind='application_forms_submitted'",
      )
      .get().application_id,
    a.id,
  );
  put("submission_reviews", {
    submission_id: "one-submission",
    owner_email: f.owner,
    status: "accepted",
    revision: "one-review",
    reviewed_by: f.owner,
  });
  assert.equal(
    f.db
      .prepare(
        "SELECT application_id FROM hiring_events WHERE kind='application_forms_accepted'",
      )
      .get().application_id,
    a.id,
  );
  assert.equal(
    (
      await service.applicationFacts(
        f.owner,
        await service.getApplication(f.owner, b.id),
      )
    ).forms_accepted,
    false,
  );
  assert.equal(
    (
      await service.applicationFacts(
        f.owner,
        await service.getApplication(f.owner, a.id),
      )
    ).forms_accepted,
    true,
  );
});

test("published preparation ownership defaults apply to new intake applications without rewriting older applications", async (t) => {
  const f = fixture(t),
    p = await pipeline(f);
  await service.savePipeline(f.owner, p.id, {
    action: "default",
    expectedRevision: p.revision,
  });
  const first = seedAcceptedPreparation(f.db, "first-inbox", f.owner);
  const a = (
    await service.listApplications(
      f.owner,
      new URLSearchParams({ candidate: first.candidateId }),
    )
  ).items[0];
  assert.equal(a.evidence.preparationMode, "application");
  assert.equal(a.evidence.preparationModeSource, "pipeline");
  const current = (await service.hiringConfiguration(f.owner)).pipelines.find(
    (v) => v.id === p.id,
  );
  await service.savePipeline(f.owner, p.id, {
    action: "publish",
    expectedRevision: current.revision,
    name: current.name,
    definition: { ...current.draft, preparationMode: "legacy" },
  });
  const second = seedAcceptedPreparation(f.db, "second-inbox", f.owner);
  const b = (
    await service.listApplications(
      f.owner,
      new URLSearchParams({ candidate: second.candidateId }),
    )
  ).items[0];
  assert.equal(b.evidence.preparationMode, "legacy");
  assert.equal(
    (await service.getApplication(f.owner, a.id)).evidence.preparationMode,
    "application",
  );
  assert.equal(a.pipelineVersionId, b.pipelineVersionId);
});
