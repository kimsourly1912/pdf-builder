import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
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
  server: { middlewareMode: true },
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
const graphs = await vite.ssrLoadModule("/features/workflows/workflow.ts");
const interviews = await vite.ssrLoadModule(
  "/features/hiring/interview.server.ts",
);
const preparation = await vite.ssrLoadModule(
  "/features/candidate-progress/progress.server.ts",
);
const reset = await vite.ssrLoadModule("/features/test-data/reset.server.ts");
const archive = await vite.ssrLoadModule("/features/archive/archive.server.ts");
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
async function mutate(f, app, values) {
  return service.mutateApplication(f.owner, app.id, {
    expectedRevision: app.revision,
    mutationId: crypto.randomUUID(),
    ...values,
  });
}
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
test("pipelines publish immutable snapshots and owner-scoped stage IDs; jobs keep their selected version", async (t) => {
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
  await service.savePipeline(f.owner, p.id, {
    action: "publish",
    name: "Engineering v2",
    definition,
    expectedRevision: p.revision,
  });
  const config = await service.hiringConfiguration(f.owner);
  assert.equal(config.versions.length, 2);
  assert.equal(
    config.versions.find((v) => v.id === app.pipelineVersionId).definition
      .stages[1].name,
    "CV screening",
  );
  assert.equal(config.jobs[0].pipelineVersionId, app.pipelineVersionId);
  assert.equal(
    (await service.getApplication(f.owner, app.id)).stageId,
    "applied",
  );
  assert.throws(
    () =>
      f.db
        .prepare(
          "UPDATE hiring_pipeline_versions SET name='changed' WHERE id=?",
        )
        .run(p.currentVersionId),
    /immutable/,
  );
  await rejects(
    service.savePipeline(f.owner, p.id, {
      action: "archive",
      expectedRevision: p.revision,
    }),
    409,
  );
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
