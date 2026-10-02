import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
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
let currentPdfBytes = pdfBytes;
let aiCalls = 0,
  sendFailure = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = String(url);
  if (target.includes("NotoSansKhmer"))
    return new Response(
      readFileSync(
        new URL(
          "../node_modules/@expo-google-fonts/noto-sans-khmer/400Regular/NotoSansKhmer_400Regular.ttf",
          import.meta.url,
        ),
      ),
    );
  if (target === "https://api.openai.com/v1/responses") {
    aiCalls++;
    return Response.json({ output_text: JSON.stringify(profile) });
  }
  if (target.includes("api.telegram.org/file/"))
    return new Response(currentPdfBytes);
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
  const response = await auth.getAuth().handler(
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
        JSON.stringify([{ id: "page-1", sourcePage: 1, rotation: 0 }]),
        t + "v1",
        now,
        now,
      );
    d1.sqlite
      .prepare(
        "INSERT INTO template_versions(id,template_id,version_number,file_key,file_name,annotations_json,page_order_json,roles_json,published_at)VALUES(?,?,1,?,?,?,?,?,?)",
      )
      .run(
        t + "v1",
        t,
        t + ".pdf",
        "form.pdf",
        annotations,
        JSON.stringify([{ id: "page-1", sourcePage: 1, rotation: 0 }]),
        roles,
        now,
      );
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

const resumeRoute = await vite.ssrLoadModule("/app/api/resumes/[id]/route.ts");
const intakeDetailRoute = await vite.ssrLoadModule(
  "/app/api/intake/[id]/route.ts",
);
const intakeRunRoute = await vite.ssrLoadModule(
  "/app/api/intake/[id]/run/route.ts",
);
const archiveRoute = await vite.ssrLoadModule(
  "/app/api/archive/[type]/[id]/route.ts",
);
const archiveService = await vite.ssrLoadModule(
  "/features/archive/archive.server.ts",
);

let nextUpdate = 100,
  manualIntake,
  manualWorkflow;
const ownerRequest = (path, body, method = "POST") =>
  new Request("http://localhost:5173" + path, {
    method,
    headers: {
      cookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function freshPdf(tag) {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.setTitle("TEST " + tag + " " + crypto.randomUUID());
  currentPdfBytes = await pdf.save();
}
async function chat(chatId, text, document) {
  const id = nextUpdate++;
  await send({
    update_id: id,
    message: {
      message_id: id,
      chat: { id: chatId, type: "private" },
      from: { id: chatId, is_bot: false, username: "test_" + chatId },
      ...(document ? { document } : { text }),
    },
  });
}
async function submit(chatId, email) {
  await freshPdf(email);
  await chat(chatId, "/start");
  await chat(chatId, "TEST " + chatId);
  await chat(chatId, email);
  await chat(chatId, null, {
    file_id: "test",
    file_name: "TEST-CV.pdf",
    file_size: currentPdfBytes.length,
  });
  return d1.sqlite
    .prepare(
      "SELECT i.* FROM telegram_intakes i JOIN telegram_connections c ON c.id=i.connection_id WHERE c.chat_id=? ORDER BY i.update_id DESC LIMIT 1",
    )
    .get(String(chatId));
}
async function overview(row) {
  const response = await intakeDetailRoute.GET(
    ownerRequest("/api/intake/" + row.id, null, "GET"),
    { params: Promise.resolve({ id: row.id }) },
  );
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function verifyCv(row, confirmTelegram = false) {
  const response = await resumeRoute.GET(
    ownerRequest("/api/resumes/" + row.resume_id, null, "GET"),
    { params: Promise.resolve({ id: row.resume_id }) },
  );
  const { resume } = await response.json();
  const save = await resumeRoute.PATCH(
    ownerRequest(
      "/api/resumes/" + row.resume_id,
      {
        action: "update_candidate",
        candidate: resume.candidate,
        confirmTelegram,
        resumeRevision: resume.updatedAt,
        candidateRevision: resume.candidateRevision,
      },
      "PATCH",
    ),
    { params: Promise.resolve({ id: row.resume_id }) },
  );
  assert.equal(save.status, 200, await save.clone().text());
  return overview(row);
}
async function workflowWithTrigger(trigger) {
  const graph = structuredClone(
    (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId)).graph,
  );
  graph.nodes.find((n) => n.kind === "resume_uploaded").config.trigger =
    trigger;
  const w = await workflows.createWorkflow(runtime.MANAGEMENT_EMAIL, trigger);
  return workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
    action: "publish",
    expectedUpdatedAt: w.updatedAt,
    name: "TEST " + trigger,
    graph,
  });
}
const archiveAction = (type, id, body) =>
  archiveRoute.POST(ownerRequest("/api/archive/" + type + "/" + id, body), {
    params: Promise.resolve({ type, id }),
  });

test("manual Resume Editor verification enables intake workflow without an AI request or a second CV review", async () => {
  const calls = aiCalls;
  manualIntake = await submit(70001, "manual@example.com");
  manualWorkflow = await workflowWithTrigger("manual");
  const before = await overview(manualIntake);
  assert.equal(before.reviewReady, false);
  let response = await intakeRunRoute.POST(
    ownerRequest("/api/intake/" + manualIntake.id + "/run", {
      workflowId: manualWorkflow.id,
      confirmTelegram: true,
    }),
    { params: Promise.resolve({ id: manualIntake.id }) },
  );
  assert.equal(response.status, 422);
  assert.equal(aiCalls, calls);
  delete runtime.OPENAI_API_KEY;
  const verified = await verifyCv(manualIntake);
  assert.equal(verified.reviewReady, true);
  assert.equal(
    d1.sqlite
      .prepare("SELECT count(*) n FROM resume_extractions WHERE resume_id=?")
      .get(manualIntake.resume_id).n,
    0,
  );
  const body = {
    workflowId: manualWorkflow.id,
    resumeRevision: verified.resumeRevision,
    candidateRevision: verified.candidateRevision,
    profileVersionId: verified.profileVersionId,
    confirmTelegram: true,
  };
  response = await intakeRunRoute.POST(
    ownerRequest("/api/intake/" + manualIntake.id + "/run", {
      ...body,
      confirmTelegram: false,
    }),
    { params: Promise.resolve({ id: manualIntake.id }) },
  );
  assert.equal(response.status, 422);
  response = await intakeRunRoute.POST(
    ownerRequest("/api/intake/" + manualIntake.id + "/run", {
      ...body,
      resumeRevision: "stale",
    }),
    { params: Promise.resolve({ id: manualIntake.id }) },
  );
  assert.equal(response.status, 409);
  const users = count("user"),
    forms = count("form_assignments"),
    sent = messages.length;
  response = await intakeRunRoute.POST(
    ownerRequest("/api/intake/" + manualIntake.id + "/run", body),
    { params: Promise.resolve({ id: manualIntake.id }) },
  );
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.equal(result.run.status, "completed", result.run.errorMessage);
  assert.equal(result.run.context.steps.review.status, "completed");
  assert.match(result.run.context.reviewNote, /Resume Editor/);
  assert.equal(count("user"), users + 1);
  assert.equal(count("form_assignments"), forms + 2);
  assert.equal(messages.length, sent + 1);
  assert.equal(aiCalls, calls);
  const current = await overview(manualIntake);
  assert.equal(current.reviewReady, true);
  response = await intakeRunRoute.POST(
    ownerRequest("/api/intake/" + manualIntake.id + "/run", {
      ...body,
      resumeRevision: current.resumeRevision,
      candidateRevision: current.candidateRevision,
      profileVersionId: current.profileVersionId,
      existingAccountId: current.existingAccount.id,
    }),
    { params: Promise.resolve({ id: manualIntake.id }) },
  );
  assert.equal(response.status, 200);
  assert.equal(count("user"), users + 1);
  assert.equal(count("form_assignments"), forms + 2);
  assert.equal(messages.length, sent + 1);
  runtime.OPENAI_API_KEY = "integration-openai";
});

test("completed bot intake rejects unsolicited PDFs and explicitly groups additional/replaced CVs under one contact", async () => {
  const calls = aiCalls;
  const original = await submit(70002, "history@example.com");
  const candidates = count("candidates"),
    intakes = count("telegram_intakes");
  await freshPdf("unsolicited");
  await chat(70002, "anything");
  await chat(70002, null, { file_id: "test", file_name: "another.pdf" });
  assert.equal(count("telegram_intakes"), intakes);
  assert.equal(count("candidates"), candidates);
  assert.match(messages.at(-1).text, /\/add_cv/);
  await chat(70002, "/add_cv");
  await chat(70002, null, { file_id: "test", file_name: "additional.pdf" });
  assert.equal(count("telegram_intakes"), intakes + 1);
  assert.equal(count("candidates"), candidates);
  let list = await intake.intakeList(
    runtime.MANAGEMENT_EMAIL,
    new URLSearchParams(),
  );
  let contact = list.filter((i) => i.email === "history@example.com");
  assert.equal(contact.length, 1);
  assert.equal(contact[0].cvCount, 2);
  const additional = d1.sqlite
    .prepare(
      "SELECT * FROM telegram_intakes WHERE connection_id=? ORDER BY update_id DESC LIMIT 1",
    )
    .get(original.connection_id);
  await chat(70002, "/replace_cv");
  await freshPdf("replacement");
  await chat(70002, null, { file_id: "test", file_name: "replacement.pdf" });
  assert.equal(count("telegram_intakes"), intakes + 2);
  assert.equal(await archiveService.isArchived("intake", additional.id), true);
  assert.equal(
    await archiveService.isArchived("resume", additional.resume_id),
    true,
  );
  assert(
    storage.has(
      d1.sqlite
        .prepare("SELECT file_key FROM resumes WHERE id=?")
        .get(additional.resume_id).file_key,
    ),
  );
  list = await intake.intakeList(
    runtime.MANAGEMENT_EMAIL,
    new URLSearchParams(),
  );
  contact = list.filter((i) => i.email === "history@example.com");
  assert.equal(contact.length, 1);
  assert.equal(contact[0].cvCount, 2);
  const latest = d1.sqlite
    .prepare(
      "SELECT * FROM telegram_intakes WHERE connection_id=? ORDER BY update_id DESC LIMIT 1",
    )
    .get(original.connection_id);
  assert.equal((await overview(latest)).cvHistory.length, 3);
  await verifyCv(latest);
  await chat(70002, "/replace_cv");
  await freshPdf("blocked replacement");
  await chat(70002, null, { file_id: "test", file_name: "blocked.pdf" });
  assert.equal(count("telegram_intakes"), intakes + 2);
  assert.match(messages.at(-1).text, /reviewed or archived/);
  assert.equal(aiCalls, calls);
});

test("workflow starting events route submissions by purpose and Telegram receipt waits for HR verification without AI", async () => {
  const telegram = await workflowWithTrigger("telegram_submission"),
    verified = await workflowWithTrigger("resume_verified"),
    calls = aiCalls,
    users = count("user");
  const row = await submit(70003, "trigger@example.com");
  let runs = d1.sqlite
    .prepare("SELECT * FROM workflow_runs WHERE resume_id=?")
    .all(row.resume_id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].workflow_id, telegram.id);
  await runner.processWorkflowRun(runs[0].id);
  assert.equal(
    (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runs[0].id)).status,
    "waiting_review",
  );
  assert.equal(count("user"), users);
  assert.equal(aiCalls, calls);
  await verifyCv(row, true);
  runs = d1.sqlite
    .prepare("SELECT * FROM workflow_runs WHERE resume_id=?")
    .all(row.resume_id);
  assert.equal(runs.length, 2);
  assert(runs.some((r) => r.workflow_id === verified.id));
  // Both saved workflows may prepare this CV, but a matching email cannot silently attach a second account.
  await runner.processWorkflowRun(
    runs.find((r) => r.workflow_id === telegram.id).id,
  );
  assert.equal(count("user"), users + 1);
  assert.equal(aiCalls, calls);
  await runner.processWorkflowRun(
    runs.find((r) => r.workflow_id === verified.id).id,
  );
  assert.equal(count("user"), users + 1);
  assert.equal(aiCalls, calls);
  assert.equal(
    (
      await workflows.getRun(
        runtime.MANAGEMENT_EMAIL,
        runs.find((r) => r.workflow_id === verified.id).id,
      )
    ).status,
    "waiting_review",
  );
  const staff = await workflows.uploadWorkflowStatements(
    runtime.MANAGEMENT_EMAIL,
    row.resume_id,
    new Date().toISOString(),
    "staff_upload",
  );
  assert(staff.length > 0);
  const none = await workflows.uploadWorkflowStatements(
    runtime.MANAGEMENT_EMAIL,
    row.resume_id,
    new Date().toISOString(),
    "manual",
  );
  assert.equal(none.length, 1); // The manual workflow only starts when explicitly requested, not from upload events.
});

test("archive groups CV and intake, preserves files, restores safely, and rejects stale or cross-owner permanent deletion", async () => {
  const row = await submit(70004, "archive@example.com"),
    key = d1.sqlite
      .prepare("SELECT file_key FROM resumes WHERE id=?")
      .get(row.resume_id).file_key;
  let response = await archiveAction("intake", row.id, { action: "archive" });
  assert.equal(response.status, 200, await response.clone().text());
  assert(storage.has(key));
  assert.equal(
    (
      await intake.intakeList(runtime.MANAGEMENT_EMAIL, new URLSearchParams())
    ).some((i) => i.id === row.id),
    false,
  );
  let group = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "intake",
    row.id,
  );
  assert.equal(group.members.length, 2);
  assert.equal((await overview(row)).archived, true);
  await assert.rejects(
    () =>
      archiveService.deleteArchivedEntity(
        "another-owner@example.com",
        "intake",
        row.id,
        group.record.archived_at,
      ),
    (e) => e.status === 404,
  );
  response = await archiveAction("intake", row.id, {
    action: "restore",
    expectedArchivedAt: "stale",
  });
  assert.equal(response.status, 409);
  response = await archiveAction("intake", row.id, {
    action: "restore",
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 200);
  assert.equal(await archiveService.isArchived("resume", row.resume_id), false);
  assert(storage.has(key));
  response = await archiveAction("resume", row.resume_id, {
    action: "archive",
  });
  assert.equal(response.status, 200);
  group = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "resume",
    row.resume_id,
  );
  response = await archiveAction("resume", row.resume_id, {
    action: "delete",
    confirm: true,
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    d1.sqlite.prepare("SELECT id FROM resumes WHERE id=?").get(row.resume_id),
    undefined,
  );
  assert.equal(
    d1.sqlite.prepare("SELECT id FROM telegram_intakes WHERE id=?").get(row.id),
    undefined,
  );
  assert.equal(storage.has(key), false);
});

test("archived account loses access but keeps assignments; linked accounts and templates cannot be permanently deleted", async () => {
  const userId = d1.sqlite
      .prepare("SELECT user_id FROM candidates WHERE id=?")
      .get(manualIntake.candidate_id).user_id,
    forms = count("form_assignments");
  let response = await archiveAction("account", userId, { action: "archive" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(
    d1.sqlite.prepare("SELECT banned FROM user WHERE id=?").get(userId).banned,
    1,
  );
  assert.equal(count("form_assignments"), forms);
  let group = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "account",
    userId,
  );
  response = await archiveAction("account", userId, {
    action: "delete",
    confirm: true,
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 409);
  assert.equal(count("form_assignments"), forms);
  response = await archiveAction("account", userId, {
    action: "restore",
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 200);
  assert.equal(
    d1.sqlite.prepare("SELECT banned FROM user WHERE id=?").get(userId).banned,
    0,
  );
  const statuses = d1.sqlite
    .prepare("SELECT status FROM form_assignments WHERE template_id='t1'")
    .all();
  response = await archiveAction("template", "t1", { action: "archive" });
  assert.equal(response.status, 200);
  assert.deepEqual(
    d1.sqlite
      .prepare("SELECT status FROM form_assignments WHERE template_id='t1'")
      .all(),
    statuses,
  );
  group = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "template",
    "t1",
  );
  response = await archiveAction("template", "t1", {
    action: "delete",
    confirm: true,
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 409);
  response = await archiveAction("template", "t1", {
    action: "restore",
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 200);
  response = await archiveAction("workflow", manualWorkflow.id, {
    action: "archive",
  });
  assert.equal(response.status, 200);
  group = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "workflow",
    manualWorkflow.id,
  );
  response = await archiveAction("workflow", manualWorkflow.id, {
    action: "delete",
    confirm: true,
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 409);
  response = await archiveAction("workflow", manualWorkflow.id, {
    action: "restore",
    expectedArchivedAt: group.record.archived_at,
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await workflows.getWorkflow(runtime.MANAGEMENT_EMAIL, manualWorkflow.id))
      .active,
    false,
  );
});

test("unused analysis files purge only after archiving; processing and protected dependency guards reject deletion", async () => {
  const id = crypto.randomUUID(),
    key = "TEST-ai/" + id + ".pdf",
    now = new Date().toISOString();
  storage.set(key, new Uint8Array([1, 2, 3]));
  d1.sqlite
    .prepare(
      "INSERT INTO ai_field_detection_runs(id,owner_email,file_key,file_name,file_size,page_count,status,model,prompt_version,created_at,updated_at)VALUES(?,?,?,?,1,1,'processing','test','test',?,?)",
    )
    .run(id, runtime.MANAGEMENT_EMAIL, key, "TEST analysis.pdf", now, now);
  let response = await archiveAction("ai_run", id, { action: "archive" });
  assert.equal(response.status, 409);
  assert(storage.has(key));
  d1.sqlite
    .prepare("UPDATE ai_field_detection_runs SET status='completed' WHERE id=?")
    .run(id);
  response = await archiveAction("ai_run", id, { action: "archive" });
  assert.equal(response.status, 200);
  assert(storage.has(key));
  const group = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "ai_run",
    id,
  );
  await archiveService.deleteArchivedEntity(
    runtime.MANAGEMENT_EMAIL,
    "ai_run",
    id,
    group.record.archived_at,
  );
  assert.equal(storage.has(key), false);
  assert.equal(
    d1.sqlite
      .prepare("SELECT id FROM ai_field_detection_runs WHERE id=?")
      .get(id),
    undefined,
  );
  const accountId = (await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId))
    .context.userId;
  await archiveService.archiveEntity(
    runtime.MANAGEMENT_EMAIL,
    "account",
    accountId,
  );
  const accountGroup = await archiveService.archivedGroup(
    runtime.MANAGEMENT_EMAIL,
    "account",
    accountId,
  );
  assert.throws(
    () =>
      d1.sqlite
        .prepare(
          "INSERT INTO archive_transition_guards(owner_email,entity_type,entity_id,archived_at,action) VALUES(?,'account',?,?,'delete')",
        )
        .run(
          runtime.MANAGEMENT_EMAIL,
          accountId,
          accountGroup.record.archived_at,
        ),
    /ARCHIVE_DEPENDENCY_PROTECTED/,
  );
  await archiveService.restoreEntity(
    runtime.MANAGEMENT_EMAIL,
    "account",
    accountId,
    accountGroup.record.archived_at,
  );
});

test("draft workflows list their chosen starting event and archives block editing", async () => {
  const w = await workflows.createWorkflow(
    runtime.MANAGEMENT_EMAIL,
    "resume_verified",
  );
  const listed = (await workflows.listWorkflows(runtime.MANAGEMENT_EMAIL)).find(
    (r) => r.id === w.id,
  );
  assert.equal(listed.trigger, "resume_verified");
  assert.equal(listed.hasTelegram, false);
  await archiveService.archiveEntity(
    runtime.MANAGEMENT_EMAIL,
    "workflow",
    w.id,
  );
  assert.equal(
    (await workflows.listWorkflows(runtime.MANAGEMENT_EMAIL)).some(
      (r) => r.id === w.id,
    ),
    false,
  );
  assert.equal(
    (await workflows.getWorkflow(runtime.MANAGEMENT_EMAIL, w.id)).archived,
    true,
  );
  await assert.rejects(
    workflows.saveWorkflow(runtime.MANAGEMENT_EMAIL, w.id, {
      action: "save",
      name: w.name,
      graph: w.draft,
      expectedUpdatedAt: w.updatedAt,
    }),
    (e) => e.status === 409,
  );
});

const progressService = await vite.ssrLoadModule(
  "/features/candidate-progress/progress.server.ts",
);
const progressRoute = await vite.ssrLoadModule(
  "/app/api/candidates/[id]/route.ts",
);
let progressIntake;
const progressGet = (id) =>
  progressService.detailProgress(runtime.MANAGEMENT_EMAIL, id);
const progressMove = (item, stage, extra = {}) =>
  progressRoute.PATCH(
    ownerRequest(
      "/api/candidates/" + item.id,
      { action: "move", stage, expectedRevision: item.revision, ...extra },
      "PATCH",
    ),
    { params: Promise.resolve({ id: item.id }) },
  );
test("candidate progress groups CV history and prevents unverified approval, stale moves and cross-owner access", async () => {
  progressIntake = await submit(71001, "progress@example.com");
  let item = await progressGet(progressIntake.candidate_id);
  assert.equal(item.stage, "new");
  const calls = aiCalls;
  let response = await progressMove(item, "approved");
  assert.equal(response.status, 422);
  assert.equal(aiCalls, calls);
  response = await progressMove(item, "reviewing");
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await progressGet(item.id)).stage, "reviewing");
  response = await progressMove(item, "new", {
    reason: "HR needs another check",
  });
  assert.equal(response.status, 409);
  item = await progressGet(item.id);
  response = await progressMove(item, "new");
  assert.equal(response.status, 422);
  response = await progressMove(item, "new", {
    reason: "HR needs another check",
  });
  assert.equal(response.status, 200);
  item = await progressGet(item.id);
  assert(
    item.activity.some(
      (a) =>
        a.action === "HR stage changed" &&
        a.metadata.reason === "HR needs another check",
    ),
  );
  await assert.rejects(
    progressService.detailProgress("other@example.com", item.id),
    (e) => e.status === 404,
  );
  const unauth = await progressRoute.GET(
    new Request("http://localhost:5173/api/candidates/" + item.id),
    { params: Promise.resolve({ id: item.id }) },
  );
  assert.equal(unauth.status, 401);
  const crossSite = ownerRequest(
    "/api/candidates/" + item.id,
    { action: "move", stage: "reviewing", expectedRevision: item.revision },
    "PATCH",
  );
  crossSite.headers.set("origin", "https://other.example.com");
  assert.equal(
    (
      await progressRoute.PATCH(crossSite, {
        params: Promise.resolve({ id: item.id }),
      })
    ).status,
    403,
  );
  await freshPdf("second progress CV");
  await chat(71001, "/add_cv");
  await chat(71001, null, { file_id: "test", file_name: "second.pdf" });
  const list = await progressService.listProgress(
    runtime.MANAGEMENT_EMAIL,
    new URLSearchParams({ search: "progress@example.com" }),
  );
  assert.equal(list.total, 1);
  assert.equal(list.items[0].cvs.length, 2);
  assert.equal(list.items[0].selectedCv.id, progressIntake.resume_id);
  assert.equal(list.items[0].stage, "new");
  const current = list.items[0];
  await progressService.updateProgress(runtime.MANAGEMENT_EMAIL, current.id, {
    action: "select_cv",
    resumeId: progressIntake.resume_id,
    expectedRevision: current.revision,
  });
  assert.equal(
    (await progressGet(current.id)).selectedCv.id,
    progressIntake.resume_id,
  );
  assert(!JSON.stringify(current).includes("token_cipher"));
  assert(!JSON.stringify(current).includes("passwordHash"));
});

test("candidate preparation shows real invitations and incomplete forms cannot move to Ready for HR", async () => {
  let item = await progressGet(manualIntake.candidate_id);
  assert.equal(item.run.status, "completed");
  assert.equal(item.facts.invitationSent, true);
  assert.equal(item.facts.required, 2);
  assert.equal(item.facts.completed, 0);
  assert.equal(item.stage, "awaiting_forms");
  assert.equal((await progressMove(item, "ready")).status, 422);
  const run = await workflows.getRun(runtime.MANAGEMENT_EMAIL, runId);
  const authResponse = await auth.getAuth().handler(
    new Request("http://localhost:5173/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        origin: "http://localhost:5173",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: run.context.reviewedEmail,
        password: "Candidate!9StrongPassword",
      }),
    }),
  );
  assert.equal(authResponse.status, 200, await authResponse.clone().text());
  const candidateCookie = authResponse.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const fillRoute = await vite.ssrLoadModule("/app/api/fill/[token]/route.ts");
  storage.set("t1.pdf", pdfBytes);
  storage.set("t2.pdf", pdfBytes);
  const assigned = d1.sqlite
    .prepare("SELECT id FROM form_assignments WHERE user_id=?")
    .all(run.context.userId);
  assert.equal(assigned.length, 2);
  let before = await progressGet(intakeRow.candidate_id);
  assert.equal(before.facts.completed, 0);
  for (let i = 0; i < assigned.length; i++) {
    const form = new FormData();
    form.set("values", JSON.stringify({ name: "TEST Dara Sok" }));
    form.set("resumeAppliedFieldIds", "[]");
    const token = "assigned_" + assigned[i].id;
    const response = await fillRoute.POST(
      new Request("http://localhost:5173/api/fill/" + token, {
        method: "POST",
        headers: {
          cookie: candidateCookie,
          origin: "http://localhost:5173",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: form,
      }),
      { params: Promise.resolve({ token }) },
    );
    assert.equal(response.status, 201, await response.clone().text());
    const after = await progressGet(intakeRow.candidate_id);
    assert.equal(after.facts.completed, i + 1);
    if (i === 0) {
      assert.equal(after.stage, "awaiting_forms");
      assert.equal((await progressMove(after, "ready")).status, 422);
    } else {
      assert.equal(after.stage, "ready");
      assert(after.forms.every((f) => f.url?.startsWith("/api/submissions/")));
      assert.equal(
        after.activity.filter((a) => a.action.startsWith("Form submitted"))
          .length,
        2,
      );
    }
  }
  assert.equal((await progressMove(before, "ready")).status, 409);
  const second = await progressGet(manualIntake.candidate_id);
  assert.equal(second.facts.completed, 0); // The other candidate's submitted forms never count here.
});

test("changing selection and archive state preserves preparation history without reusing completion of another CV", async () => {
  let item = await progressGet(progressIntake.candidate_id);
  const other = item.cvs.find((c) => c.id !== progressIntake.resume_id);
  assert(other);
  await archiveService.archiveEntity(
    runtime.MANAGEMENT_EMAIL,
    "resume",
    progressIntake.resume_id,
  );
  item = await progressGet(item.id);
  assert.equal(item.selectedCv.id, other.id);
  assert.equal(
    item.cvs.find((c) => c.id === progressIntake.resume_id).archived,
    true,
  );
  await assert.rejects(
    progressService.updateProgress(runtime.MANAGEMENT_EMAIL, item.id, {
      action: "select_cv",
      resumeId: progressIntake.resume_id,
      expectedRevision: item.revision,
    }),
    (e) => e.status === 422,
  );
  await archiveService.archiveEntity(
    runtime.MANAGEMENT_EMAIL,
    "resume",
    other.id,
  );
  await assert.rejects(progressGet(item.id), (e) => e.status === 404);
  const completed = await progressGet(intakeRow.candidate_id);
  await progressService.updateProgress(runtime.MANAGEMENT_EMAIL, completed.id, {
    action: "move",
    stage: "reviewing",
    reason: "HR wants to check the CV again",
    expectedRevision: completed.revision,
  });
  const moved = await progressGet(completed.id);
  assert.equal(moved.stage, "reviewing");
  assert.equal(moved.facts.completed, 2);
  assert.equal(moved.facts.invitationSent, true);
  assert.equal(moved.automaticStage, "ready");
});

test("candidate stage transaction rejects form changes after the page revision was read", async () => {
  const item = await progressGet(manualIntake.candidate_id),
    form = d1.sqlite
      .prepare(
        "SELECT f.id,f.updated_at FROM form_assignments f WHERE f.user_id=? LIMIT 1",
      )
      .get(
        (await workflows.getRun(runtime.MANAGEMENT_EMAIL, item.run.id)).context
          .userId,
      );
  const originalBatch = d1.batch;
  let intercepted = false;
  d1.batch = async (statements) => {
    if (
      !intercepted &&
      statements[0]?.query.includes("candidate_progress_guards")
    ) {
      intercepted = true;
      d1.sqlite
        .prepare(
          "UPDATE form_assignments SET status='cancelled',updated_at=? WHERE id=?",
        )
        .run(new Date(Date.now() + 1000).toISOString(), form.id);
    }
    return originalBatch(statements);
  };
  try {
    await assert.rejects(
      progressService.updateProgress(runtime.MANAGEMENT_EMAIL, item.id, {
        action: "move",
        stage: "reviewing",
        reason: "Check the CV again",
        expectedRevision: item.revision,
      }),
      (e) => e.status === 409,
    );
    assert(intercepted);
    assert.equal(
      d1.sqlite
        .prepare(
          "SELECT candidate_id FROM candidate_progress WHERE candidate_id=?",
        )
        .get(item.id),
      undefined,
    );
  } finally {
    d1.batch = originalBatch;
    d1.sqlite
      .prepare(
        "UPDATE form_assignments SET status='assigned',updated_at=? WHERE id=?",
      )
      .run(form.updated_at, form.id);
  }
});
