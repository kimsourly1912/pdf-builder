import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import { seedAcceptedPreparation } from "./helpers/interview-fixture.mjs";
import { authenticatedApi, DEMO_CONFIRMATION, demoPipeline, resetWorkspace, routingGraph, seedDemo } from "../scripts/hiring-demo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const objects = new Map();
const runtime = {
  DB: null, MANAGEMENT_EMAIL: "admin@gmail.com", AUTH_BOOTSTRAP_TOKEN: "local-demo-bootstrap",
  BETTER_AUTH_URL: "http://localhost:5173", BETTER_AUTH_SECRET: "local-demo-secret-32-characters-long",
  ENVIRONMENT: "development", TEST_DATA_RESET_ENABLED: "true", OPENAI_API_KEY: "local-demo-provider-must-not-be-called",
  FILES: {
    async put(key, bytes) { objects.set(key, bytes); },
    async delete(key) { objects.delete(key); },
    async get(key) { return objects.has(key) ? { arrayBuffer: async () => objects.get(key) } : null; },
  },
};
globalThis.__telegramTestEnv = runtime;
const vite = await createServer({ configFile: false, appType: "custom", root,
  resolve: { alias: { "@": root, "server-only": root + "/tests/helpers/server-only.mjs", "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs" } },
  server: { middlewareMode: true, hmr: false },
});
after(async () => { runtime.DB?.close(); await vite.close(); });
const models = await vite.ssrLoadModule("/features/workflows/workflow.ts");
const hiring = await vite.ssrLoadModule("/features/hiring/hiring.ts");
const automation = await vite.ssrLoadModule("/features/hiring/automation.server.ts");
const runner = await vite.ssrLoadModule("/features/workflows/runner.server.ts");

test("demo pipelines and routing rules use supported fields and preserve evidence requirements", () => {
  for (const first of [false, true]) assert(hiring.definitionSchema.safeParse(demoPipeline(first)).success);
  const graph = routingGraph({ trigger: "application_forms_accepted", pipelineVersionId: "v1", jobId: "job1", from: "documents", to: "interview" });
  assert.deepEqual(models.graphIssues(graph), []);
  assert.equal(graph.nodes.find(n => n.kind === "condition").config.field, "jobId");
  assert.deepEqual(demoPipeline().stages.find(s => s.id === "interview").entry, ["cv_approved", "forms_accepted"]);
  assert.equal(demoPipeline(true).stages[2].activity, "interview");
});

test("reset requires explicit confirmation, the existing administrator and an unblocked preview", async () => {
  const calls = [];
  const api = async (path, body) => {
    calls.push({path,body});
    if(path === "/api/auth/get-session") return {user:{id:"admin",email:"admin@gmail.com"}};
    return {preview:{counts:[],files:0,blockers:["Active processing"],revision:"preview"}};
  };
  await assert.rejects(resetWorkspace(api, "wrong", ()=>{}), /confirmation/);
  assert.equal(calls.length, 0);
  await assert.rejects(resetWorkspace(api, DEMO_CONFIRMATION, ()=>{}), /Active processing/);
  assert.equal(calls.some(c => c.body?.action === "reset"), false);
});

test("demo reset and seeding preserve admin credentials and exercise real application/account/form routing without AI or Telegram", async () => {
  runtime.DB = sqliteD1();
  const origin = "http://localhost:5173";
  const routes = new Map();
  const patterns = [
    [/^\/api\/auth\/.*$/, "/app/api/auth/[...all]/route.ts"],
    [/^\/api\/test-data$/, "/app/api/test-data/route.ts"],
    [/^\/api\/forms$/, "/app/api/forms/route.ts"],
    [/^\/api\/forms\/([^/]+)\/publish$/, "/app/api/forms/[id]/publish/route.ts"],
    [/^\/api\/workflows$/, "/app/api/workflows/route.ts"],
    [/^\/api\/workflows\/([^/]+)$/, "/app/api/workflows/[id]/route.ts"],
    [/^\/api\/hiring\/pipelines$/, "/app/api/hiring/pipelines/route.ts"],
    [/^\/api\/hiring\/pipelines\/([^/]+)$/, "/app/api/hiring/pipelines/[id]/route.ts"],
    [/^\/api\/hiring\/jobs$/, "/app/api/hiring/jobs/route.ts"],
    [/^\/api\/hiring\/applications$/, "/app/api/hiring/applications/route.ts"],
    [/^\/api\/hiring\/applications\/([^/]+)\/preparation$/, "/app/api/hiring/applications/[id]/preparation/route.ts"],
    [/^\/api\/hiring\/applications\/([^/]+)$/, "/app/api/hiring/applications/[id]/route.ts"],
    [/^\/api\/resumes$/, "/app/api/resumes/route.ts"],
    [/^\/api\/resumes\/([^/]+)\/approval-preview$/, "/app/api/resumes/[id]/approval-preview/route.ts"],
    [/^\/api\/resumes\/([^/]+)$/, "/app/api/resumes/[id]/route.ts"],
    [/^\/api\/workflow-runs\/([^/]+)\/review$/, "/app/api/workflow-runs/[id]/review/route.ts"],
    [/^\/api\/account\/change-password$/, "/app/api/account/change-password/route.ts"],
    [/^\/api\/portal\/assignments$/, "/app/api/portal/assignments/route.ts"],
    [/^\/api\/fill\/([^/]+)$/, "/app/api/fill/[token]/route.ts"],
    [/^\/api\/submissions\/([^/]+)\/review$/, "/app/api/submissions/[id]/review/route.ts"],
    [/^\/api\/accounts$/, "/app/api/accounts/route.ts"],
  ];
  const externalFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = async () => { externalRequests++; throw new Error("External AI or Telegram requests are forbidden in demo setup tests."); };
  try {
    const localFetch = async (url, options = {}) => {
      const request = new Request(url, options);
      const path = new URL(url).pathname;
      const route = patterns.find(([re]) => re.test(path));
      assert(route, `Missing demo test route ${path}`);
      const [re, file] = route;
      if (!routes.has(file)) routes.set(file, await vite.ssrLoadModule(file));
      const id = path.match(re)[1];
      const response = await routes.get(file)[request.method](request, {params:Promise.resolve({id,token:id})});
      if(!response.ok) console.error("Local demo route rejected", request.method, path, response.status, await response.clone().text());
      if (response.ok && ["POST", "PATCH"].includes(request.method) && !path.startsWith("/api/auth/")) {
        // Drain the same application-event work scheduled by worker/index.ts.
        for (let i=0;i<3;i++) { await automation.dispatchApplicationEvents(); await runner.processPendingWorkflowRuns(); }
      }
      return response;
    };
    const password = "Local!AdminPassword123";
    const signup = await localFetch(`${origin}/api/auth/sign-up/email`, {method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"x-pdf-builder-bootstrap":runtime.AUTH_BOOTSTRAP_TOKEN},body:JSON.stringify({name:"Administrator",email:"admin@gmail.com",password})});
    assert.equal(signup.status, 200);
    const api = await authenticatedApi(origin,"admin@gmail.com",password,localFetch);
    const userBefore = runtime.DB.sqlite.prepare("SELECT id FROM user WHERE email='admin@gmail.com'").get();
    seedAcceptedPreparation(runtime.DB.sqlite, "old", "admin@gmail.com");
    await api("/api/forms", {name:"Old sample form to remove"});
    await resetWorkspace(api,DEMO_CONFIRMATION,()=>{});
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM user").get().n,1);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM templates").get().n,0);
    const result = await seedDemo(api, {log:console.log,candidateApiFactory:(email,password)=>authenticatedApi(origin,email,password,localFetch)});
    assert.deepEqual(result.samples.map(s=>s.stage),["documents","interview","screening"]);
    assert.equal(result.samples.some(s=>"password" in s || "email" in s),false);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM user").get().n,3);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM templates").get().n,1);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM telegram_deliveries").get().n,0);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM submissions").get().n,1);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM resume_extractions").get().n,0);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM resume_processing_jobs WHERE status='failed'").get().n,0);
    assert.equal(externalRequests,0);
    assert.equal(runtime.DB.sqlite.prepare("SELECT count(*) n FROM hiring_applications").get().n,3);
    assert.equal(runtime.DB.sqlite.prepare("SELECT name FROM hiring_pipelines WHERE is_default=1").get().name,"DEMO Engineering — documents before interview");
    assert.deepEqual(runtime.DB.sqlite.prepare("SELECT id FROM user WHERE email='admin@gmail.com'").get(),userBefore);
    await authenticatedApi(origin,"admin@gmail.com",password,localFetch);
  } finally { globalThis.fetch = externalFetch; }
});
