import { startApplicationPreparation } from "./preparation.server";
import "server-only";
import { getDatabaseBinding } from "@/db";
import { workflowRuns } from "@/features/workflows/schema";
import {
  graphIssues,
  nextNode,
  workflowTrigger,
  type RunContext,
  type WorkflowGraph,
} from "@/features/workflows/workflow";
import { isResponse } from "@/features/templates/template.server";
import {
  hiringConfiguration,
  hiringFail,
  hiringBatch,
  hiringGuard,
  getApplication,
  mutateApplication,
  nowIso,
} from "./hiring.server";
import { isApplicationTrigger } from "./hiring";

export async function validateApplicationGraph(
  owner: string,
  graph: WorkflowGraph,
) {
  if (!isApplicationTrigger(workflowTrigger(graph))) return;
  const issues = graphIssues(graph);
  if (issues.length) hiringFail(issues[0]);
  const start = graph.nodes.find((n) => n.kind === "resume_uploaded")!,
    config = await hiringConfiguration(owner);
  const version = config.versions.find(
    (v) => v.id === start.config.pipelineVersionId && !v.archived,
  );
  if (!version)
    hiringFail(
      "Choose an active published hiring pipeline before publishing this workflow.",
    );
  const stageIds = new Set(version.definition.stages.map((s) => s.id));
  for (const node of graph.nodes) {
    if (node.kind === "prepare_application") {
      const child = await (
        await import("@/features/workflows/workflow.server")
      ).getWorkflow(owner, node.config.preparationWorkflowId ?? "");
      if (
        child.archived ||
        !child.active ||
        !child.published ||
        isApplicationTrigger(workflowTrigger(child.published)) ||
        !child.published.nodes.some((n) => n.kind === "review_resume")
      )
        hiringFail(
          "Choose an active published CV preparation workflow with a review gate.",
        );
      node.config.preparationWorkflowVersion = child.version;
      node.config.preparationWorkflowName = child.name;
    }
    if (node.config.stageId)
      node.config.stageLabel = version.definition.stages.find(
        (s) => s.id === node.config.stageId,
      )?.name;
    if (node.config.fromStageId)
      node.config.fromStageLabel = version.definition.stages.find(
        (s) => s.id === node.config.fromStageId,
      )?.name;
    if (node.config.field === "stageId")
      node.config.valueLabel = version.definition.stages.find(
        (s) => s.id === node.config.value,
      )?.name;
    if (node.config.field === "jobId")
      node.config.valueLabel = config.jobs.find(
        (j) => j.id === node.config.value,
      )?.title;
    for (const value of [node.config.stageId, node.config.fromStageId])
      if (value && !stageIds.has(value))
        hiringFail(
          "A referenced stage does not belong to the selected published pipeline.",
        );
    if (
      node.config.pipelineVersionId &&
      node.config.pipelineVersionId !== version.id
    )
      hiringFail(
        "All application stages must use the starting event's pipeline version.",
      );
    if (
      node.kind === "condition" &&
      node.config.field === "stageId" &&
      !stageIds.has(node.config.value ?? "")
    )
      hiringFail("Choose a condition stage from the selected pipeline.");
    if (
      node.kind === "condition" &&
      node.config.field === "jobId" &&
      !config.jobs.some(
        (j) =>
          j.id === node.config.value &&
          !j.archived &&
          j.pipelineVersionId === version.id,
      )
    )
      hiringFail("Choose an active job using this pipeline version.");
  }
}
type EventRow = {
  id: string;
  application_id: string;
  owner_email: string;
  kind: string;
  from_stage: string | null;
  to_stage: string;
  context_json: string;
  resume_id: string;
};
type Context = {
  pipelineVersionId: string;
  jobId: string | null;
  stageId: string;
  fromStageId: string | null;
  applicationRevision: number;
  chain: string[];
  source?: string;
  appliedPosition?: string;
};

// Pending events and snapshotted executions commit together. Retried dispatch cannot
// pick up a newer graph after the event has been marked dispatched.
export async function dispatchApplicationEvents(limit = 50) {
  const db = getDatabaseBinding(),
    events = (
      await db
        .prepare(
          "SELECT e.*,a.resume_id FROM hiring_events e JOIN hiring_applications a ON a.id=e.application_id AND a.owner_email=e.owner_email WHERE e.status='pending' AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='hiring_application' AND ar.entity_id=a.id) ORDER BY e.created_at,e.rowid LIMIT ?",
        )
        .bind(limit)
        .all<EventRow>()
    ).results;
  for (const event of events) {
    const context = JSON.parse(event.context_json) as Context;
    const workflows = (
      await db
        .prepare(
          "SELECT id,name,version,published_json FROM workflows w WHERE owner_email=? AND active=1 AND published_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM archive_records x WHERE x.entity_type='workflow' AND x.entity_id=w.id) ORDER BY id LIMIT 50",
        )
        .bind(event.owner_email)
        .all<{
          id: string;
          name: string;
          version: number;
          published_json: string;
        }>()
    ).results;
    const [guard, cleanup] = hiringGuard(
      "EXISTS(SELECT 1 FROM hiring_events e WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM archive_records ar WHERE ar.entity_type='hiring_application' AND ar.entity_id=e.application_id))",
      [event.id],
    );
    const statements = [guard];
    for (const w of workflows) {
      const graph = JSON.parse(w.published_json) as WorkflowGraph,
        start = graph.nodes.find((n) => n.kind === "resume_uploaded"),
        trigger = workflowTrigger(graph);
      if (
        !start ||
        !isApplicationTrigger(trigger) ||
        start.config.pipelineVersionId !== context.pipelineVersionId
      )
        continue;
      const matches =
        trigger === event.kind ||
        (trigger === "stage_entered" &&
          ["application_received", "job_assigned"].includes(event.kind)) ||
        (trigger === "stage_left" && event.kind === "stage_entered");
      if (!matches) continue;
      if (
        trigger === "stage_entered" &&
        start.config.stageId !== event.to_stage
      )
        continue;
      if (trigger === "stage_left" && start.config.stageId !== event.from_stage)
        continue;
      const runContext: RunContext = {
        steps: {},
        applicationEvent: {
          id: event.id,
          applicationId: event.application_id,
          ...context,
        },
      };
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO workflow_runs(id,workflow_id,owner_email,workflow_name,version,resume_id,event_id,application_id,graph_json,context_json,current_node_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? FROM workflows WHERE id=? AND owner_email=? AND version=? AND active=1",
          )
          .bind(
            crypto.randomUUID(),
            w.id,
            event.owner_email,
            w.name,
            w.version,
            event.resume_id,
            event.id,
            event.application_id,
            w.published_json,
            JSON.stringify(runContext),
            start.id,
            nowIso(),
            nowIso(),
            w.id,
            event.owner_email,
            w.version,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          "UPDATE hiring_events SET status='dispatched' WHERE id=? AND status='pending'",
        )
        .bind(event.id),
      cleanup,
    );
    try {
      await hiringBatch(statements);
    } catch (error) {
      if (isResponse(error) && error.status === 409) continue;
      throw error;
    }
  }
  return events.length;
}

export async function processApplicationRouting(
  row: typeof workflowRuns.$inferSelect,
  token: string,
) {
  const db = getDatabaseBinding(),
    graph = JSON.parse(row.graphJson) as WorkflowGraph,
    context = JSON.parse(row.contextJson) as RunContext,
    event = context.applicationEvent;
  let nodeId = row.currentNodeId;
  const checkpoint = async (status: string, error: string | null = null) => {
    await db.batch([
      db
        .prepare(
          "UPDATE workflow_runs SET context_json=?,current_node_id=?,status=?,error_message=?,lock_token=NULL,locked_until=NULL,updated_at=? WHERE id=? AND owner_email=? AND lock_token=? AND locked_until>?",
        )
        .bind(
          JSON.stringify(context),
          nodeId,
          status,
          error,
          nowIso(),
          row.id,
          row.ownerEmail,
          token,
          nowIso(),
        ),
    ]);
  };
  try {
    if (!event) hiringFail("This application event is unavailable.");
    if (event.chain.includes(row.workflowId) || event.chain.length >= 12)
      hiringFail(
        "Automation loop stopped. Review the stage routing rules.",
        409,
      );
    const saved = await db
      .prepare(
        "SELECT context_json FROM hiring_events WHERE id=? AND application_id=? AND owner_email=?",
      )
      .bind(event.id, event.applicationId, row.ownerEmail)
      .first<{ context_json: string }>();
    if (!saved) hiringFail("This application event is unavailable.");
    const facts = JSON.parse(saved.context_json) as Context;
    for (let count = 0; count < 32; count++) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) hiringFail("This routing step is unavailable.");
      let outcome: "next" | "yes" | "no" = "next",
        note = "";
      if (node.kind === "condition") {
        const field = node.config.field ?? "source",
          actual =
            field === "stageId"
              ? facts.stageId
              : field === "jobId"
                ? facts.jobId
                : field === "source"
                  ? facts.source
                  : facts.appliedPosition;
        const match =
          field === "stageId" || field === "jobId"
            ? actual === node.config.value
            : (actual ?? "").trim().toLowerCase() ===
              (node.config.value ?? "").trim().toLowerCase();
        outcome = (node.config.operator === "is_not" ? !match : match)
          ? "yes"
          : "no";
        note = `Condition ${outcome === "yes" ? "matched" : "did not match"}`;
      } else if (node.kind === "move_stage") {
        const app = await getApplication(row.ownerEmail, event.applicationId);
        // A receipt for this step permits recovery after a transition committed
        // but its execution checkpoint was lost.
        await mutateApplication(
          row.ownerEmail,
          app.id,
          {
            action: "move",
            stageId: node.config.stageId,
            fromStageId: node.config.fromStageId,
            expectedRevision: event.applicationRevision,
            mutationId: `routing_${row.id}_${node.id}`.slice(0, 100),
            reason: "Published application routing",
          },
          {
            runId: row.id,
            token,
            chain: event.chain,
            workflowId: row.workflowId,
          },
        );
        note = "Application moved after checking its current requirements";
      } else if (node.kind === "prepare_application") {
        const application = await getApplication(
          row.ownerEmail,
          event.applicationId,
        );
        if (application.evidence.preparationMode !== "application")
          hiringFail(
            "Open the application's CV & documents tab and explicitly select application preparation automation before running this action.",
            409,
          );
        await startApplicationPreparation(
          row.ownerEmail,
          event.applicationId,
          {
            workflowId: node.config.preparationWorkflowId,
            publishedVersion: node.config.preparationWorkflowVersion,
            expectedRevision: event.applicationRevision,
            confirmIndependent: true,
            confirmLegacySeparation: true,
          },
          { runId: row.id, token, chain: [...event.chain, row.workflowId] },
        );
        note =
          "Application preparation started; HR account/contact review is required";
      } else if (!["resume_uploaded", "complete", "stop"].includes(node.kind))
        hiringFail(
          "This application workflow contains an unsupported preparation action.",
        );
      context.steps[node.id] = {
        status: "completed",
        attempts: (context.steps[node.id]?.attempts ?? 0) + 1,
        startedAt: nowIso(),
        completedAt: nowIso(),
        outcome,
        note,
      };
      if (node.kind === "complete" || node.kind === "stop") {
        await checkpoint("completed");
        return;
      }
      nodeId = nextNode(graph, node.id, outcome);
    }
    hiringFail("This routing workflow exceeded its step limit.");
  } catch (error) {
    const message = isResponse(error)
      ? await error
          .clone()
          .json()
          .then((v) =>
            v &&
            typeof v === "object" &&
            "error" in v &&
            typeof v.error === "string"
              ? v.error
              : "Application routing failed.",
          )
          .catch(() => "Application routing failed.")
      : "Application routing failed. Review the application and retry.";
    context.steps[nodeId] = {
      ...context.steps[nodeId],
      status: "failed",
      attempts: (context.steps[nodeId]?.attempts ?? 0) + 1,
      note: message,
    };
    await checkpoint("failed", message);
  }
}
