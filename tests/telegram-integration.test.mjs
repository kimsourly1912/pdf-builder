import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { PDFDocument } from "pdf-lib";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const d1 = sqliteD1(),
  storage = new Map(),
  messages = [];
const runtime = {
  DB: d1,
  FILES: {
    async put(key, bytes) {
      storage.set(key, new Uint8Array(bytes));
    },
    async get(key) {
      const b = storage.get(key);
      return b ? { body: new Response(b).body } : null;
    },
    async delete(key) {
      storage.delete(key);
    },
  },
  MANAGEMENT_EMAIL: "owner@example.com",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "integration-secret-not-production",
  ENVIRONMENT: "development",
  AUTH_BOOTSTRAP_TOKEN: "integration-bootstrap",
  TELEGRAM_BOT_TOKEN: "integration-dummy",
  TELEGRAM_WEBHOOK_SECRET: "integration-webhook",
  TELEGRAM_BOT_USERNAME: "anghr_bot",
  OPENAI_API_KEY: "integration-openai",
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
const profileModule = await vite.ssrLoadModule(
  "/features/resumes/candidate-profile.ts",
);
const profile = profileModule.candidateProfileFromSummary({
  id: "candidate",
  fullName: "TEST Dara Sok",
  email: "dara@example.com",
  phone: "",
  address: "Phnom Penh",
  dateOfBirth: null,
  gender: "",
  nationality: "",
  currentTitle: "Engineer",
  professionalSummary: "",
  skills: ["TypeScript"],
  workExperience: [],
  education: [],
  certifications: [],
  languages: [],
  links: [],
  verificationStatus: "extracted",
});
const pdf = await PDFDocument.create();
pdf.addPage();
pdf.setTitle("TEST Telegram CV");
const pdfBytes = await pdf.save();
let aiCalls = 0,
  sendFailure = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target === "https://api.openai.com/v1/responses") {
    aiCalls++;
    return Response.json({ output_text: JSON.stringify(profile) });
  }
  if (target.includes("api.telegram.org/file/")) return new Response(pdfBytes);
  if (target.endsWith("/getFile"))
    return Response.json({
      ok: true,
      result: { file_path: "documents/cv.pdf", file_size: pdfBytes.length },
    });
  if (target.endsWith("/sendMessage")) {
    const body = JSON.parse(options.body);
    if (sendFailure === "uncertain")
      throw new Error("TEST network disconnected");
    if (sendFailure === "rate")
      return Response.json(
        { ok: false, parameters: { retry_after: 1 } },
        { status: 429 },
      );
    messages.push(body);
    return Response.json({ ok: true, result: { message_id: messages.length } });
  }
  throw new Error("Unexpected network request in Telegram test");
};
const intake = await vite.ssrLoadModule("/features/telegram/intake.server.ts");
const workflows = await vite.ssrLoadModule(
  "/features/workflows/workflow.server.ts",
);
const runner = await vite.ssrLoadModule("/features/workflows/runner.server.ts");
const review = await vite.ssrLoadModule("/features/workflows/review.server.ts");
const analysis = await vite.ssrLoadModule(
  "/features/resumes/analyze-resume.server.ts",
);
const graphModule = await vite.ssrLoadModule("/features/workflows/workflow.ts");
const activationRoute = await vite.ssrLoadModule("/app/api/activate/route.ts");
const webhookRoute = await vite.ssrLoadModule(
  "/app/api/telegram/webhook/route.ts",
);
const telegramActionRoute = await vite.ssrLoadModule(
  "/app/api/workflow-runs/[id]/telegram/route.ts",
);
const extractRoute = await vite.ssrLoadModule(
  "/app/api/intake/[id]/extract/route.ts",
);
const auth = await vite.ssrLoadModule("/lib/auth.ts");
after(async () => {
  globalThis.fetch = originalFetch;
  await vite.close();
  d1.close();
  delete globalThis.__telegramTestEnv;
});
const count = (table) =>
  d1.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
function update(id, text, document) {
  return {
    update_id: id,
    message: {
      message_id: id,
      chat: { id: 12345, type: "private" },
      from: { id: 12345, is_bot: false, username: "test_dara" },
      ...(document ? { document } : { text }),
    },
  };
}
async function send(update) {
  await intake.receiveTelegramUpdate(update);
  await intake.processTelegramUpdates();
}
async function ownerCookie() {
  const response = await auth
    .getAuth()
    .handler(
      new Request("http://localhost:5173/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          origin: "http://localhost:5173",
          "content-type": "application/json",
          "x-pdf-builder-bootstrap": runtime.AUTH_BOOTSTRAP_TOKEN,
        },
        body: JSON.stringify({
          name: "TEST Owner",
          email: runtime.MANAGEMENT_EMAIL,
          password: "TestOwner!9StrongPassword",
        }),
      }),
    );
  assert.equal(response.status, 200, await response.text());
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
let intakeRow, workflowId, runId, cookie;
test("real intake service stores a PDF and candidate but never calls AI or creates a login account", async () => {
  const unauthorized = await webhookRoute.POST(
    new Request("http://localhost:5173/api/telegram/webhook", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" },
      body: JSON.stringify(update(1, "/start")),
    }),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(count("telegram_updates"), 0);
  for (const u of [
    update(1, "/start"),
    update(2, "TEST Dara Sok"),
    update(3, "dara@example.com"),
    update(4, null, {
      file_id: "fixture-file",
      file_name: "TEST CV.pdf",
      mime_type: "application/pdf",
      file_size: pdfBytes.length,
    }),
  ])
    await send(u);
  assert.equal(aiCalls, 0);
  assert.equal(count("user"), 0);
  assert.equal(count("workflow_runs"), 0);
  assert.equal(count("resume_extractions"), 0);
  assert.equal(count("candidates"), 1);
  assert.equal(count("resumes"), 1);
  assert.equal(count("telegram_intakes"), 1);
  assert.equal(storage.size, 1);
  await send(
    update(4, null, { file_id: "fixture-file", file_name: "TEST CV.pdf" }),
  );
  assert.equal(count("telegram_intakes"), 1);
  intakeRow = d1.sqlite.prepare("SELECT * FROM telegram_intakes").get();
  assert.equal(intakeRow.extraction_status, "not_extracted");
  assert(messages.at(-1).text.includes("No AI analysis"));
  cookie = await ownerCookie();
});
test("paid extraction requires explicit confirmation, serializes clicks, and successful extraction is reused", async () => {
  const make = (body) =>
    new Request(`http://localhost:5173/api/intake/${intakeRow.id}/extract`, {
      method: "POST",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const context = { params: Promise.resolve({ id: intakeRow.id }) };
  assert.equal((await extractRoute.POST(make({}), context)).status, 422);
  assert.equal(aiCalls, 0);
  assert.equal(
    (
      await analysis.analyzeResumeForOwner(
        new Request("http://localhost"),
        runtime.MANAGEMENT_EMAIL,
        intakeRow.resume_id,
      )
    ).status,
    409,
  );
  assert.equal(aiCalls, 0);
  delete runtime.OPENAI_API_KEY;
  const notConfigured = await extractRoute.POST(
    make({ confirm: true }),
    context,
  );
  assert.equal(notConfigured.status, 503);
  assert.match((await notConfigured.json()).error, /not configured/);
  assert.equal(aiCalls, 0);
  runtime.OPENAI_API_KEY = "integration-openai";
  const response = await extractRoute.POST(make({ confirm: true }), context);
  assert.equal(response.status, 200, await response.text());
  assert.equal(aiCalls, 1);
  assert.equal(
    d1.sqlite.prepare("SELECT extraction_status FROM telegram_intakes").get()
      .extraction_status,
    "extracted",
  );
  assert.equal(
    (await extractRoute.POST(make({ confirm: true }), context)).status,
    200,
  );
  assert.equal(aiCalls, 1);
  d1.sqlite
    .prepare(
      "UPDATE telegram_intakes SET extraction_token='active',extraction_until=?,extraction_status='processing'",
    )
    .run(new Date(Date.now() + 600000).toISOString());
  assert.equal(
    (await extractRoute.POST(make({ confirm: true, reextract: true }), context))
      .status,
    409,
  );
  assert.equal(aiCalls, 1);
  d1.sqlite.exec(
    "UPDATE telegram_intakes SET extraction_status='extracted',extraction_token=NULL,extraction_until=NULL",
  );
});
test("approved workflow creates account and mapped forms, then sends encrypted single-use activation", async () => {
  const now = new Date().toISOString(),
    roles = JSON.stringify([
      { id: "candidate", name: "Candidate", color: "#2563eb" },
    ]),
    annotations = JSON.stringify([
      {
        id: "name",
        page: 1,
        type: "input",
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.04,
        color: "#2563eb",
        recipientRoleId: "candidate",
        prefillKey: "candidate.full_name",
      },
    ]);
  for (const t of ["t1", "t2"]) {
    d1.sqlite
      .prepare(
        "INSERT INTO templates(id,owner_email,name,file_key,file_name,annotations_json,page_order_json,current_version_id,created_at,updated_at)VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        t,
        runtime.MANAGEMENT_EMAIL,
        "TEST " + t,
        t + ".pdf",
        "form.pdf",
        annotations,
        "[]",
        t + "v1",
        now,
        now,
      );
    d1.sqlite
      .prepare(
        "INSERT INTO template_versions(id,template_id,version_number,file_key,file_name,annotations_json,page_order_json,roles_json,published_at)VALUES(?,?,1,?,?,?,?,?,?)",
      )
      .run(t + "v1", t, t + ".pdf", "form.pdf", annotations, "[]", roles, now);
  }
  const graph = graphModule.defaultGraph();
  graph.nodes.find((n) => n.kind === "assign_forms").config.forms = [
    { templateId: "t1", roleId: "candidate" },
    { templateId: "t2", roleId: "candidate" },
  ];
  graph.nodes.push({
    id: "telegram",
    kind: "send_telegram",
    position: { x: 80, y: 900 },
    config: {
      message: "Hello {name}, email {email}. {formCount} forms ready.",
    },
  });
  graph.edges.find((e) => e.source === "assign").target = "telegram";
  graph.edges.push({
    id: "telegram-complete",
    source: "telegram",
    target: "done",
    outcome: "next",
  });
  let w = await workflows.createWorkflow(runtime.MANAGEMENT_EMAIL);
  workflowId = w.id;
  w = await workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
    action: "publish",
    expectedUpdatedAt: w.updatedAt,
    name: "TEST Telegram workflow",
    graph,
  });
  runId = await workflows.startWorkflow(
    runtime.MANAGEMENT_EMAIL,
    workflowId,
    intakeRow.resume_id,
  );
  await runner.processWorkflowRun(runId);
  assert.equal(
    (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId)).status,
    "waiting_review",
  );
  assert.equal(count("user"), 1);
  assert.equal(count("form_assignments"), 0);
  assert.equal(aiCalls, 1);
  const data = await review.getReviewData(runtime.MANAGEMENT_EMAIL, runId);
  await assert.rejects(
    () =>
      review.reviewRun(runtime.MANAGEMENT_EMAIL, runId, {
        action: "approve",
        candidate: data.candidate,
        checks: [true, true, true],
        resumeRevision: data.resumeRevision,
        candidateRevision: data.candidateRevision,
        telegramConnectionId: data.suggestedConnectionId,
      }),
    (e) => e.status === 422,
  );
  await review.reviewRun(runtime.MANAGEMENT_EMAIL, runId, {
    action: "approve",
    candidate: data.candidate,
    checks: [true, true, true],
    resumeRevision: data.resumeRevision,
    candidateRevision: data.candidateRevision,
    telegramConnectionId: data.suggestedConnectionId,
    confirmTelegram: true,
  });
  await runner.processWorkflowRun(runId);
  const run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId);
  assert.equal(run.status, "completed", run.errorMessage);
  assert.equal(count("user"), 2);
  assert.equal(count("form_assignments"), 2);
  assert.equal(count("account_activations"), 1);
  assert.equal(aiCalls, 1);
  assert.equal(
    d1.sqlite.prepare("SELECT password_hash FROM workflow_runs").get()
      .password_hash,
    null,
  );
  const invitation = messages.find((m) => m.reply_markup);
  assert(invitation);
  assert.equal(
    invitation.reply_markup.inline_keyboard[0][0].text,
    "Activate account & open forms",
  );
  assert(invitation.text.includes("2 forms"));
  const token = invitation.reply_markup.inline_keyboard[0][0].url.split("#")[1];
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert(!JSON.stringify(run).includes(token));
  assert(
    !d1.sqlite
      .prepare("SELECT token_cipher FROM telegram_deliveries")
      .get()
      .token_cipher.includes(token),
  );
  for (const r of d1.sqlite
    .prepare("SELECT initial_values_json FROM form_assignments")
    .all())
    assert.equal(JSON.parse(r.initial_values_json).name, "TEST Dara Sok");
  await runner.processWorkflowRun(runId);
  assert.equal(messages.filter((m) => m.reply_markup).length, 1);
  assert.equal(count("form_assignments"), 2);
  const activate = () =>
    new Request("http://localhost:5173/api/activate", {
      method: "POST",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token, password: "Candidate!9StrongPassword" }),
    });
  assert.equal((await activationRoute.POST(activate())).status, 200);
  assert.equal((await activationRoute.POST(activate())).status, 410);
  assert.equal(
    d1.sqlite.prepare("SELECT token_cipher FROM telegram_deliveries").get()
      .token_cipher,
    null,
  );
  assert.equal(
    d1.sqlite
      .prepare(
        "SELECT must_change_password FROM recipient_profiles WHERE user_id=?",
      )
      .get(run.context.userId).must_change_password,
    0,
  );
});
test("rejected review sends no invitation and creates no downstream account or forms", async () => {
  const graph = (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId)).graph;
  let w = await workflows.createWorkflow(runtime.MANAGEMENT_EMAIL);
  await workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
    action: "publish",
    expectedUpdatedAt: w.updatedAt,
    name: "TEST rejection",
    graph,
  });
  const rejectedId = await workflows.startWorkflow(
    runtime.MANAGEMENT_EMAIL,
    w.id,
    intakeRow.resume_id,
  );
  await runner.processWorkflowRun(rejectedId);
  const before = messages.length;
  await review.reviewRun(runtime.MANAGEMENT_EMAIL, rejectedId, {
    action: "reject",
    note: "TEST rejected CV",
  });
  await runner.processWorkflowRun(rejectedId);
  assert.equal(
    (await workflows.getRun(runtime.MANAGEMENT_EMAIL, rejectedId)).status,
    "rejected",
  );
  assert.equal(messages.length, before);
  assert.equal(count("user"), 2);
  assert.equal(count("form_assignments"), 2);
});
test("unknown send results are flagged and never automatically duplicated", async () => {
  const graph = (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId)).graph;
  let w = await workflows.createWorkflow(runtime.MANAGEMENT_EMAIL);
  await workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
    action: "publish",
    expectedUpdatedAt: w.updatedAt,
    name: "TEST uncertain delivery",
    graph,
  });
  const id = await workflows.startWorkflow(
    runtime.MANAGEMENT_EMAIL,
    w.id,
    intakeRow.resume_id,
  );
  await runner.processWorkflowRun(id);
  const data = await review.getReviewData(runtime.MANAGEMENT_EMAIL, id);
  await review.reviewRun(runtime.MANAGEMENT_EMAIL, id, {
    action: "approve",
    candidate: data.candidate,
    checks: [true, true, true],
    resumeRevision: data.resumeRevision,
    candidateRevision: data.candidateRevision,
    existingAccountId: data.existingAccount.id,
    telegramConnectionId: data.suggestedConnectionId,
    confirmTelegram: true,
  });
  sendFailure = "uncertain";
  await runner.processWorkflowRun(id);
  sendFailure = null;
  const run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, id);
  assert.equal(run.status, "failed");
  assert.match(run.errorMessage, /uncertain/);
  const before = messages.length;
  d1.sqlite
    .prepare(
      "UPDATE workflow_runs SET status='queued',lock_token=NULL,locked_until=NULL WHERE id=?",
    )
    .run(id);
  await runner.processWorkflowRun(id);
  assert.equal(messages.length, before);
  assert.equal(count("form_assignments"), 2);
});

test("missing contact pauses delivery and HR can explicitly connect it without repeating prior actions", async () => {
  const graph = (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId)).graph;
  const w = await workflows.createWorkflow(runtime.MANAGEMENT_EMAIL);
  await workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
    action: "publish",
    expectedUpdatedAt: w.updatedAt,
    name: "TEST connect waiting",
    graph,
  });
  const id = await workflows.startWorkflow(
    runtime.MANAGEMENT_EMAIL,
    w.id,
    intakeRow.resume_id,
  );
  await runner.processWorkflowRun(id);
  const data = await review.getReviewData(runtime.MANAGEMENT_EMAIL, id);
  await review.reviewRun(runtime.MANAGEMENT_EMAIL, id, {
    action: "approve",
    candidate: data.candidate,
    checks: [true, true, true],
    resumeRevision: data.resumeRevision,
    candidateRevision: data.candidateRevision,
    existingAccountId: data.existingAccount.id,
  });
  const before = messages.length;
  await runner.processWorkflowRun(id);
  let run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, id);
  assert.equal(run.status, "queued");
  assert.equal(run.context.waitingFor, "telegram");
  assert.equal(messages.length, before);
  const response = await telegramActionRoute.POST(
    new Request("http://localhost:5173/api/workflow-runs/" + id + "/telegram", {
      method: "POST",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "connect",
        confirm: true,
        connectionId: data.suggestedConnectionId,
        expectedUpdatedAt: run.updatedAt,
      }),
    }),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(response.status, 200, await response.text());
  run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, id);
  assert.equal(run.status, "completed");
  assert.equal(count("form_assignments"), 2);
  assert.equal(count("user"), 2);
  assert(
    messages.at(-1).reply_markup.inline_keyboard[0][0].url.includes("/sign-in"),
  );
});
test("Telegram rate limits defer delivery, and explicit resends preserve accounts and assignments", async () => {
  const graph = (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId)).graph;
  const w = await workflows.createWorkflow(runtime.MANAGEMENT_EMAIL);
  await workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
    action: "publish",
    expectedUpdatedAt: w.updatedAt,
    name: "TEST rate limit",
    graph,
  });
  const id = await workflows.startWorkflow(
    runtime.MANAGEMENT_EMAIL,
    w.id,
    intakeRow.resume_id,
  );
  await runner.processWorkflowRun(id);
  const data = await review.getReviewData(runtime.MANAGEMENT_EMAIL, id);
  await review.reviewRun(runtime.MANAGEMENT_EMAIL, id, {
    action: "approve",
    candidate: data.candidate,
    checks: [true, true, true],
    resumeRevision: data.resumeRevision,
    candidateRevision: data.candidateRevision,
    existingAccountId: data.existingAccount.id,
    telegramConnectionId: data.suggestedConnectionId,
    confirmTelegram: true,
  });
  sendFailure = "rate";
  await runner.processWorkflowRun(id);
  sendFailure = null;
  let run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, id);
  assert.equal(run.status, "queued");
  assert.equal(run.context.waitingFor, "telegram_retry");
  const before = messages.length;
  await runner.processWorkflowRun(id);
  assert.equal(messages.length, before);
  d1.sqlite
    .prepare(
      "UPDATE telegram_deliveries SET next_attempt_at=NULL WHERE run_id=?",
    )
    .run(id);
  await runner.processWorkflowRun(id);
  run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, id);
  assert.equal(run.status, "completed");
  const response = await telegramActionRoute.POST(
    new Request("http://localhost:5173/api/workflow-runs/" + id + "/telegram", {
      method: "POST",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "resend",
        confirm: true,
        connectionId: data.suggestedConnectionId,
        expectedUpdatedAt: run.updatedAt,
      }),
    }),
    { params: Promise.resolve({ id }) },
  );
  assert.equal(response.status, 200, await response.text());
  assert.equal(messages.length, before + 2);
  assert.equal(count("form_assignments"), 2);
  assert.equal(count("user"), 2);
});
