import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { defaultGraph, graphIssues, parseGraph, nextNode, conditionMatches } from "../features/workflows/workflow.ts";

function configuredGraph() {
  const graph = defaultGraph();
  graph.nodes.find(n => n.kind === "assign_forms").config.forms = [{ templateId: "template-1", roleId: "candidate" }];
  return graph;
}

test("candidate preparation has complete approved and rejected paths", () => {
  const graph = configuredGraph();
  assert.deepEqual(graphIssues(graph), []);
  assert.equal(nextNode(graph, "review", "approved"), "account");
  assert.equal(nextNode(graph, "review", "rejected"), "stop");
});
test("publishing blocks account actions that bypass review", () => {
  const graph = configuredGraph(); graph.edges.find(e => e.source === "extract").target = "account";
  assert.ok(graphIssues(graph).some(i => i.includes("approved review")));
});
test("Telegram workflows can move an application only after approved review and with a selected pipeline", () => {
  const graph = configuredGraph();
  graph.nodes[0].config.trigger = "telegram_submission";
  graph.nodes.push({ id: "move", kind: "move_stage", position: { x: 0, y: 0 }, config: { pipelineVersionId: "published-pipeline", fromStageId: "applied", stageId: "screening" } });
  graph.edges.find((e) => e.id === "review-account").target = "move";
  graph.edges.push({ id: "move-account", source: "move", target: "account", outcome: "next" });
  assert.deepEqual(graphIssues(graph), []);
  assert.equal(parseGraph(graph).nodes.find((n) => n.id === "move").config.pipelineVersionId, "published-pipeline");
  graph.nodes.find((n) => n.id === "move").config.pipelineVersionId = "";
  assert(graphIssues(graph).some((i) => i.includes("pipeline in Move application")));
  graph.edges.find((e) => e.id === "extract-review").target = "move";
  assert(graphIssues(graph).some((i) => i.includes("follow an approved CV review")));
  graph.nodes[0].config.trigger = "stage_entered";
  assert(graphIssues(graph).some((i) => i.includes("Application workflows support")));
});
test("rejected CVs cannot create accounts", () => {
  const graph = configuredGraph(); graph.edges.find(e => e.outcome === "rejected").target = "account";
  assert.ok(graphIssues(graph).some(i => i.includes("Rejected reviews")));
});
test("loops and disconnected steps cannot publish", () => {
  const graph = configuredGraph(); graph.edges.find(e => e.source === "assign").target = "extract";
  assert.ok(graphIssues(graph).some(i => i.includes("loops")));
  assert.ok(graphIssues(graph).some(i => i.includes("Connect all")));
});
test("form assignment requires a linked account and nonduplicate targets", () => {
  const graph = configuredGraph(); graph.edges.find(e => e.source === "account").target = "assign";
  assert.ok(graphIssues(graph).some(i => i.includes("Link the resume")));
  graph.nodes.find(n => n.kind === "assign_forms").config.forms.push({ templateId: "template-1", roleId: "candidate" });
  assert.ok(graphIssues(graph).some(i => i.includes("duplicate template")));
});
test("draft graph normalization rejects invalid input and strips client version pins", () => {
  const graph = configuredGraph();
  graph.nodes.find(n => n.kind === "assign_forms").config.forms[0].versionId = "untrusted-version";
  assert.equal(parseGraph(graph).nodes.find(n => n.kind === "assign_forms").config.forms[0].versionId, undefined);
  graph.nodes[0].position.x = Infinity; assert.equal(parseGraph(graph), null);
  assert.equal(parseGraph({ nodes: [], edges: [{ id: "x", source: "a", target: "b", outcome: "execute_arbitrary_code" }] }), null);
});
test("resume conditions normalize surrounding whitespace and letter case", () => {
  assert.equal(conditionMatches({ field: "source", value: " Email " }, { source: "email", appliedPosition: "HR" }), true);
  const position = { field: "appliedPosition", value: "Frontend Dev" };
  for (const title of ["Frontend Dev", " frontend dev ", "FRONTEND DEV"])
    assert.equal(conditionMatches(position, { source: "email", appliedPosition: title }), true);
  for (const title of ["Frontend Developer", "Front-end Dev", "Frontend  Dev", ""])
    assert.equal(conditionMatches(position, { source: "email", appliedPosition: title }), false);
  assert.equal(conditionMatches({ ...position, operator: "is_not" }, { source: "email", appliedPosition: "Backend Dev" }), true);
  assert.equal(conditionMatches({ field: "appliedPosition", value: "Engineer" }, { source: "email", appliedPosition: "HR" }), false);
});

function database() {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON;");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  db.exec(`INSERT INTO candidates (id,owner_email,full_name,created_at,updated_at) VALUES ('candidate','owner@example.com','Sokha','t0','candidate-revision');
    INSERT INTO resumes (id,owner_email,candidate_id,file_key,file_name,file_size,content_type,checksum,page_count,source,received_date,status,created_at,updated_at)
    VALUES ('resume','owner@example.com','candidate','resume.pdf','cv.pdf',100,'application/pdf','checksum',1,'email','2026-10-02','ready','t0','resume-revision');
    INSERT INTO workflows (id,owner_email,name,draft_json,created_at,updated_at) VALUES ('workflow','owner@example.com','Candidate preparation','{}','t0','t0');
    INSERT INTO workflow_runs (id,workflow_id,owner_email,workflow_name,version,resume_id,graph_json,status,current_node_id,lock_token,created_at,updated_at)
    VALUES ('run','workflow','owner@example.com','Candidate preparation',1,'resume','{}','running','review','lock','t0','t0');`);
  return db;
}
test("all migrations apply and workflow retries cannot duplicate a resume run", () => {
  const db = database();
  assert.throws(() => db.exec(`INSERT INTO workflow_runs (id,workflow_id,owner_email,workflow_name,version,resume_id,graph_json,current_node_id,created_at,updated_at) VALUES ('duplicate','workflow','owner@example.com','Changed name',2,'resume','{}','upload','t1','t1');`), /UNIQUE/);
  assert.equal(db.prepare("SELECT version FROM workflow_runs WHERE id='run'").get().version, 1);
  db.close();
});
test("stale review aborts the transaction and preserves candidate data", () => {
  const db = database(); db.exec("BEGIN");
  assert.throws(() => db.exec(`INSERT INTO workflow_review_decisions (id,run_id,owner_email,candidate_id,run_lock_token,resume_revision,candidate_revision,action,created_at) VALUES ('decision','run','owner@example.com','candidate','lock','resume-revision','stale-revision','approve','t1'); UPDATE candidates SET full_name='Wrong overwrite' WHERE id='candidate';`), /WORKFLOW_REVIEW_CHANGED/);
  db.exec("ROLLBACK"); assert.equal(db.prepare("SELECT full_name FROM candidates").get().full_name, "Sokha"); db.close();
});
test("review guard rejects the wrong owner or a stale worker lease", () => {
  const db = database();
  const insert = db.prepare("INSERT INTO workflow_review_decisions (id,run_id,owner_email,candidate_id,run_lock_token,resume_revision,candidate_revision,action,created_at) VALUES (?,'run',?,'candidate',?,'resume-revision','candidate-revision','approve','t1')");
  assert.throws(() => insert.run("wrong-owner", "other@example.com", "lock"), /WORKFLOW_REVIEW_CHANGED/);
  assert.throws(() => insert.run("old-lease", "owner@example.com", "old-lock"), /WORKFLOW_REVIEW_CHANGED/);
  insert.run("valid", "owner@example.com", "lock"); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workflow_review_decisions").get().n, 1); db.close();
});
test("removing a resume retains workflow history for staff diagnosis", () => {
  const db = database(); db.exec("DELETE FROM resumes WHERE id='resume'"); assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workflow_runs").get().n, 1); db.close();
});

test("side-effect batches abort for expired or replaced execution leases", () => {
  const db = database();
  db.exec("UPDATE workflow_runs SET locked_until='2026-10-02T12:10:00Z' WHERE id='run'");
  const guard = db.prepare("INSERT INTO workflow_execution_guards VALUES ('run',?,?)");
  assert.throws(() => guard.run("old-lock", "2026-10-02T12:00:00Z"), /WORKFLOW_LEASE_CHANGED/);
  assert.throws(() => guard.run("lock", "2026-10-02T12:11:00Z"), /WORKFLOW_LEASE_CHANGED/);
  db.exec("BEGIN");
  db.exec("UPDATE candidates SET full_name='Uncommitted side effect' WHERE id='candidate'");
  assert.throws(() => guard.run("old-lock", "2026-10-02T12:00:00Z"), /WORKFLOW_LEASE_CHANGED/);
  db.exec("ROLLBACK");
  assert.equal(db.prepare("SELECT full_name FROM candidates").get().full_name, "Sokha");
  guard.run("lock", "2026-10-02T12:00:00Z");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM workflow_execution_guards").get().n, 0);
  db.close();
});

test("unexpected database errors never expose credentials in run errors", async () => {
  const { WorkflowStepError, workflowErrorMessage } = await import("../features/workflows/workflow-errors.ts");
  const sensitive = "Failed query: INSERT INTO account password params: private-password-hash";
  assert.equal(workflowErrorMessage(new Error(sensitive)).includes("private-password-hash"), false);
  assert.equal(workflowErrorMessage({ message: sensitive }).includes("private-password-hash"), false);
  assert.equal(workflowErrorMessage(new WorkflowStepError("Template was archived.")), "Template was archived.");
});
