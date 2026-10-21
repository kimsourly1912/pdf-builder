import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PDFDocument, StandardFonts } from "pdf-lib";

export const DEMO_CONFIRMATION = "RESET DEMO KEEP ADMIN";
const ORIGIN = "https://pdf-builder.kimsur61.workers.dev";
const OWNER = "admin@gmail.com";

export function demoPipeline(interviewFirst = false) {
  const stage = (id, name, activity, entry = [], exit = []) => ({
    id, name, activity, entry, exit, color: "neutral", description: "",
  });
  return {
    preparationMode: "application",
    stages: interviewFirst
      ? [
          stage("applied", "Applied", "inbox"),
          stage("screening", "CV screening", "cv_review"),
          stage("interview", "Sales interview", "interview", ["cv_approved"], ["interview_complete"]),
          stage("documents", "Documents", "forms", ["cv_approved"], ["forms_accepted"]),
          stage("offer", "Offer", "offer", ["cv_approved", "interview_complete", "forms_accepted"]),
        ]
      : [
          stage("applied", "Applied", "inbox"),
          stage("screening", "CV screening", "cv_review"),
          stage("documents", "Documents", "forms", ["cv_approved", "preparation_ready"], ["forms_accepted"]),
          stage("interview", "Technical interview", "interview", ["cv_approved", "forms_accepted"], ["interview_complete"]),
          stage("offer", "Offer", "offer", ["cv_approved", "forms_accepted", "interview_complete"]),
        ],
  };
}

export function routingGraph({ trigger, pipelineVersionId, jobId, from, to, preparationWorkflowId }) {
  const node = (id, kind, config) => ({ id, kind, config, position: { x: 80 + ["start", "match", "action", "done", "stop"].indexOf(id) * 320, y: id === "stop" ? 220 : 80 } });
  return {
    nodes: [
      node("start", "resume_uploaded", { trigger, pipelineVersionId }),
      node("match", "condition", { field: "jobId", operator: "is", value: jobId }),
      node("action", preparationWorkflowId ? "prepare_application" : "move_stage",
        preparationWorkflowId ? { preparationWorkflowId } : { fromStageId: from, stageId: to }),
      node("done", "complete", {}), node("stop", "stop", {}),
    ],
    edges: [
      { id: "start-match", source: "start", target: "match", outcome: "next" },
      { id: "yes-action", source: "match", target: "action", outcome: "yes" },
      { id: "no-stop", source: "match", target: "stop", outcome: "no" },
      { id: "action-done", source: "action", target: "done", outcome: "next" },
    ],
  };
}

export async function authenticatedApi(origin, email, password, fetcher = fetch) {
  const response = await fetcher(`${origin}/api/auth/sign-in/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }), redirect: "manual", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Sign-in failed (HTTP ${response.status}); no reset attempted.`);
  const cookie = response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  if (!cookie.includes("pdf_builder.session_token=")) throw new Error("No authenticated session; no reset attempted.");
  return async (path, body, method = body === undefined ? "GET" : "POST", extraHeaders = {}) => {
    if (!path.startsWith("/api/") || path.includes("://")) throw new Error("Only application API paths are allowed.");
    const form = body instanceof FormData;
    const result = await fetcher(`${origin}${path}`, {
      method, headers: { Cookie: cookie, Origin: origin, ...(!form && body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      redirect: "manual", signal: AbortSignal.timeout(120000),
    });
    if (!result.ok) {
      // Never log response bodies, cookies, credentials or form-access capabilities.
      throw new Error(`Demo API operation ${method} ${path.split("?")[0].replace(/\/fill\/[^/]+/, "/fill/[link]")} failed (HTTP ${result.status}).`);
    }
    return result.json();
  };
}

export async function resetWorkspace(api, confirmation, log = console.log) {
  if (confirmation !== DEMO_CONFIRMATION) throw new Error("The demo reset confirmation is missing.");
  const before = await api("/api/auth/get-session");
  if (before?.user?.email !== OWNER || !before.user.id) throw new Error("The existing management administrator is required.");
  const choice = { scope: "all", keepDefinitions: false };
  const { preview } = await api("/api/test-data", { ...choice, action: "preview" });
  log(`Reset preview: ${preview.counts.reduce((n, c) => n + c.count, 0)} selected rows; ${preview.files} file references.`);
  for (const count of preview.counts) log(`${count.label}: ${count.count}`);
  if (preview.blockers.length) throw new Error(`Reset blocked: ${preview.blockers.join(" ")}`);
  const { result } = await api("/api/test-data", { ...choice, action: "reset", revision: preview.revision, confirmation: "DELETE TEST DATA" });
  const after = await api("/api/auth/get-session");
  if (after?.user?.id !== before.user.id || after.user.email !== OWNER) throw new Error("Administrator preservation verification failed.");
  log(`Reset finished; administrator identity preserved. ${result.filesPending ?? "Unknown"} files await background cleanup.`);
  return result;
}

async function waitFor(read, matches, label, log) {
  for (let i = 0; i < 90; i++) {
    const value = await read();
    if (matches(value)) return value;
    if (value?.run?.status === "failed") throw new Error(`Demo ${label} failed. Inspect the application execution.`);
    if (i % 10 === 0) log(`Waiting for ${label}…`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${label}. Do not reset again; inspect existing sample records.`);
}

export async function seedDemo(api, { log = console.log, candidateApiFactory } = {}) {
  // Refuse to mix this predictable dataset with any existing business definitions.
  const initial = await api("/api/workflows");
  const existing = await api("/api/hiring/applications");
  if (initial.items.length || initial.templates.length || existing.total) throw new Error("Seed requires an empty reset workspace.");
  const name = "DEMO Frontend application form";
  const form = await api("/api/forms", { name });
  const definition = {
    format: 1, pageCount: 0, mappings: [], fields: [
      { id: "portfolio", key: "portfolio", type: "short_text", label: "Portfolio or GitHub URL", required: true },
      { id: "experience", key: "experience", type: "number", label: "Years of frontend experience", min: 0, max: 50, required: true },
      { id: "available", key: "available", type: "paragraph", label: "Availability and preferred working hours", required: true },
    ],
  };
  await api(`/api/forms/${form.id}/publish`, { name, description: "Synthetic demo. No Telegram delivery or paid AI.", revision: form.revision, definition });

  async function pipeline(name, interviewFirst) {
    const definition = demoPipeline(interviewFirst);
    const created = await api("/api/hiring/pipelines", { name, definition });
    const config = await api(`/api/hiring/pipelines/${created.id}`, { action: "publish", expectedRevision: 1, name, definition }, "PATCH");
    return config.pipelines.find((p) => p.id === created.id);
  }
  const frontend = await pipeline("DEMO Engineering — documents before interview", false);
  const sales = await pipeline("DEMO Sales — interview before documents", true);
  const frontendJob = await api("/api/hiring/jobs", { title: "Frontend Developer", pipelineVersionId: frontend.currentVersionId });
  const salesJob = await api("/api/hiring/jobs", { title: "Sales Executive", pipelineVersionId: sales.currentVersionId });

  async function publish(name, graph, preset = "manual") {
    const { workflow } = await api("/api/workflows", { preset });
    return (await api(`/api/workflows/${workflow.id}`, { action: "publish", name, graph, expectedUpdatedAt: workflow.updatedAt }, "PATCH")).workflow;
  }
  const { workflow: prepDraft } = await api("/api/workflows", { preset: "manual" });
  const prep = structuredClone(prepDraft.draft);
  prep.nodes = prep.nodes.filter((n) => n.kind !== "send_telegram");
  prep.edges = prep.edges.filter((e) => e.source !== "telegram" && e.target !== "telegram");
  prep.edges.push({ id: "assign-done", source: "assign", target: "done", outcome: "next" });
  prep.nodes.find((n) => n.kind === "assign_forms").config.forms = [{ templateId: form.id, roleId: "form_user" }];
  const preparation = (await api(`/api/workflows/${prepDraft.id}`, {
    action: "publish", name: "DEMO Prepare frontend account + CV + form (no Telegram)", graph: prep, expectedUpdatedAt: prepDraft.updatedAt,
  }, "PATCH")).workflow;

  const scope = { pipelineVersionId: frontend.currentVersionId, jobId: frontendJob.id };
  const rules = [
    ["1 · Frontend job assigned → CV screening", { trigger: "job_assigned", from: "applied", to: "screening" }],
    ["2 · Frontend CV approved → prepare account and form", { trigger: "application_cv_approved", preparationWorkflowId: preparation.id }],
    ["3 · Frontend preparation completed → Documents", { trigger: "application_preparation_completed", from: "screening", to: "documents" }],
    ["4 · Frontend forms accepted → Technical interview", { trigger: "application_forms_accepted", from: "documents", to: "interview" }],
  ];
  for (const [name, rule] of rules) await publish(name, routingGraph({ ...scope, ...rule }), "position_routing");
  await publish("5 · Sales job assigned → CV screening", routingGraph({ trigger: "job_assigned", pipelineVersionId: sales.currentVersionId, jobId: salesJob.id, from: "applied", to: "screening" }), "job_routing");

  async function candidate(fullName, slug, position, model, job, approve) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    ["SYNTHETIC DEMO CV — not a real applicant", fullName, `Position: ${position}`, "Skills: React, TypeScript, CSS", "Experience: 3 years", `Reference: ${slug}`].forEach((line, i) => page.drawText(line.replace("—", "-"), { x: 50, y: 760 - i * 30, size: 14, font }));
    const data = new FormData();
    data.set("file", new Blob([await pdf.save()], { type: "application/pdf" }), `${slug}.pdf`);
    data.set("source", "other"); data.set("appliedPosition", position);
    data.set("receivedDate", new Date().toISOString().slice(0, 10));
    data.set("note", "DEMO ONLY: synthetic CV, saved manually; paid AI and Telegram skipped.");
    // Store a CV for manual review without claiming extraction failed or invoking AI.
    data.set("manualReview", "true");
    const uploaded = await api("/api/resumes", data);
    const path = `/api/resumes/${uploaded.resume.id}`;
    const details = (await api(path)).resume;
    const profile = { ...details.candidate, fullName, email: `${slug}@example.test`, phone: "", address: "", dateOfBirth: "", gender: "", nationality: "", currentTitle: position, professionalSummary: "Synthetic profile for testing application automation.", skills: ["React", "TypeScript"], workExperience: ["3 years — synthetic example"], education: [], certifications: [], languages: ["English"], links: [] };
    await api(path, { action: "save_changes", candidate: profile, resumeRevision: details.updatedAt, candidateRevision: details.candidateRevision }, "PATCH");
    const { application } = await api("/api/hiring/applications", { candidateId: details.candidate.id, resumeId: details.id, pipelineVersionId: model.currentVersionId, mutationId: randomUUID() });
    await api(`/api/hiring/applications/${application.id}`, { action: "assign_job", jobId: job.id, stageId: "applied", expectedRevision: application.revision, mutationId: randomUUID(), reason: "Assign synthetic demo to its structured job opening." }, "PATCH");
    await waitFor(() => api(`/api/hiring/applications/${application.id}`), (v) => v.application.stageId === "screening", "job condition and move to CV screening", log);
    log(`${fullName}: routed by job ID; free-text position is "${position}".`);
    if (!approve) return { id: application.id, name: fullName, stage: "screening", next: "Review and approve the sales CV, then move to Sales interview." };
    const current = (await api(path)).resume;
    const { plan } = await api(`${path}/approval-preview`, { email: profile.email });
    await api(path, { action: "approve_cv", candidate: profile, resumeRevision: current.updatedAt, candidateRevision: current.candidateRevision, approvalPlanRevision: plan.revision }, "PATCH");
    const review = await waitFor(() => api(`/api/hiring/applications/${application.id}/preparation`), (v) => v.run?.status === "waiting_review", "application preparation review", log);
    const reviewPath = `/api/workflow-runs/${review.run.id}/review`;
    const values = await api(reviewPath);
    const password = `Demo!A7${randomUUID()}`;
    await api(reviewPath, { action: "approve", candidate: values.candidate, checks: [true, true, true], resumeRevision: values.resumeRevision, candidateRevision: values.candidateRevision, temporaryPassword: password, note: "One-time owner-authorized approval of a synthetic demo candidate. Real applicant approval policy is unchanged." });
    await waitFor(() => api(`/api/hiring/applications/${application.id}`), (v) => v.application.stageId === "documents", "account creation, CV linking, form assignment and move to Documents", log);
    return { id: application.id, name: fullName, stage: "documents", email: profile.email, password, next: "Complete the assigned frontend form, then accept it as HR." };
  }
  const dara = await candidate("DEMO Dara Frontend — forms to complete", "demo-dara-frontend", "frontend", frontend, frontendJob, true);
  const lina = await candidate("DEMO Lina Frontend — ready for interview", "demo-lina-frontend", "Front-end Developer", frontend, frontendJob, true);
  const vannak = await candidate("DEMO Vannak Sales — needs CV review", "demo-vannak-sales", "Sales Executive", sales, salesJob, false);
  if (!candidateApiFactory) throw new Error("A candidate authentication factory is required to complete the advanced sample.");
  let recipient = await candidateApiFactory(lina.email, lina.password);
  const newPassword = `Demo!Changed9${randomUUID()}`;
  await recipient("/api/account/change-password", { currentPassword: lina.password, newPassword });
  recipient = await candidateApiFactory(lina.email, newPassword);
  const portal = await recipient("/api/portal/assignments");
  if (portal.assignments.length !== 1 || !portal.assignments[0].url) throw new Error("Expected one assigned frontend form.");
  const fillPath = `/api${portal.assignments[0].url}`;
  const fill = await recipient(fillPath);
  const answers = new FormData();
  answers.set("revision", fill.formDraftRevision ?? "");
  answers.set("values", JSON.stringify({ portfolio: "https://example.com/demo-portfolio", experience: 3, available: "DEMO: available in two weeks; weekday working hours." }));
  const submitted = await recipient(fillPath, answers, "POST", { "Idempotency-Key": randomUUID() });
  const { review } = await api(`/api/submissions/${submitted.submission.id}/review`);
  await api(`/api/submissions/${submitted.submission.id}/review`, { action: "accept", expectedRevision: review.revision ?? "", reason: "Owner accepts synthetic demo answers to demonstrate evidence-based stage routing." });
  await waitFor(() => api(`/api/hiring/applications/${lina.id}`), (v) => v.application.stageId === "interview", "accepted forms condition and move to Technical interview", log);
  lina.stage = "interview"; lina.next = "Schedule a technical interview. Offer and hiring decisions remain explicit.";
  for (const sample of [dara, lina, vannak]) { delete sample.password; delete sample.email; }
  // Enable future automatic intake only after seeding, avoiding duplicate inbox
  // applications while the explicit sample applications are being constructed.
  await api(`/api/hiring/pipelines/${frontend.id}`, {
    action: "default", expectedRevision: frontend.revision,
  }, "PATCH");
  const accounts = await api("/api/accounts");
  if (accounts.totalItems !== 2) throw new Error("Expected exactly two demo recipient accounts after cleanup.");
  return { samples: [dara, lina, vannak], pipelines: 2, jobs: 2, forms: 1, workflows: 6, telegramSent: 0, paidAiCalls: 0 };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.DEMO_CONFIRMATION !== DEMO_CONFIRMATION) throw new Error("Run the confirmed hiring demo setup from the serialized production workflow.");
  const password = process.env.OWNER_PASSWORD;
  if (!password || process.env.MANAGEMENT_EMAIL !== OWNER) throw new Error("The configured administrator credentials are required.");
  const api = await authenticatedApi(ORIGIN, OWNER, password);
  await resetWorkspace(api, process.env.DEMO_CONFIRMATION);
  const result = await seedDemo(api, { candidateApiFactory: (email, password) => authenticatedApi(ORIGIN, email, password) });
  console.log(JSON.stringify(result));
  // Verify the same password still signs into the preserved administrator.
  await authenticatedApi(ORIGIN, OWNER, password);
  console.log("Hiring demo verified. Admin preserved. No paid AI or Telegram sends.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Unknown demo setup error.");
    console.error("Hiring demo setup failed. Inspect the recorded step and current workspace before retrying; do not reset a successful dataset again.");
    process.exitCode = 1;
  });
}
