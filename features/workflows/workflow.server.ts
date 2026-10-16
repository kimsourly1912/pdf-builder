import { workflowBusinessSummary } from "./business-summary";
import { presetGraph, WORKFLOW_PRESETS, type WorkflowPreset } from "./presets";
import { isArchived } from "@/features/archive/archive.server";
import { notArchived } from "@/features/archive/archive";
import "server-only";

import {
  and,
  desc,
  eq,
  isNull,
  or,
  lt,
  like,
  count,
  gte,
  sql,
} from "drizzle-orm";
import { getDb, getDatabaseBinding } from "@/db";
import {
  auditEvents,
  candidates,
  resumes,
  templates,
  templateVersions,
} from "@/db/schema";
import { parseVersionRoles } from "@/features/templates/template-write";
import { jsonError } from "@/features/templates/template.server";
import { workflowVersions, workflowRuns, workflows } from "./schema";
import {
  defaultGraph,
  applicationGraph,
  graphIssues,
  parseGraph,
  parseDraftGraph,
  type TemplateOption,
  type WorkflowGraph,
  type WorkflowRun,
  type RunContext,
  type RunStatus,
  type WorkflowTrigger,
  workflowTrigger,
} from "./workflow";
import { isApplicationTrigger } from "@/features/hiring/hiring";
import { validateApplicationGraph } from "@/features/hiring/automation.server";

export function fail(message: string, status = 400): never {
  throw jsonError(message, status);
}
export function workflowAudit(
  ownerEmail: string,
  action: string,
  id: string,
  metadata: Record<string, unknown> = {},
) {
  return getDb()
    .insert(auditEvents)
    .values({
      id: crypto.randomUUID(),
      ownerEmail,
      actorType: "owner",
      actorId: ownerEmail,
      action,
      targetType: "workflow",
      targetId: id,
      metadataJson: JSON.stringify(metadata),
      createdAt: new Date().toISOString(),
    });
}

export async function listWorkflows(ownerEmail: string) {
  const rows = await getDb()
    .select({
      id: workflows.id,
      name: workflows.name,
      active: workflows.active,
      version: workflows.version,
      updatedAt: workflows.updatedAt,
      publishedJson: workflows.publishedJson,
      draftJson: workflows.draftJson,
      latestRunWaitingFor: sql<
        string | null
      >`(select json_extract(context_json, '$.waitingFor') from workflow_runs wr where wr.workflow_id = ${workflows.id} and wr.owner_email = ${workflows.ownerEmail} order by wr.created_at desc, wr.id desc limit 1)`,
      latestRunId: sql<
        string | null
      >`(select id from workflow_runs wr where wr.workflow_id = ${workflows.id} and wr.owner_email = ${workflows.ownerEmail} order by wr.created_at desc, wr.id desc limit 1)`,
      latestRunStatus: sql<RunStatus | null>`(select status from workflow_runs wr where wr.workflow_id = ${workflows.id} and wr.owner_email = ${workflows.ownerEmail} order by wr.created_at desc, wr.id desc limit 1)`,
      latestRunAt: sql<
        string | null
      >`(select created_at from workflow_runs wr where wr.workflow_id = ${workflows.id} and wr.owner_email = ${workflows.ownerEmail} order by wr.created_at desc, wr.id desc limit 1)`,
    })
    .from(workflows)
    .where(
      and(
        eq(workflows.ownerEmail, ownerEmail),
        notArchived("workflow", workflows.id),
      ),
    )
    .orderBy(desc(workflows.updatedAt))
    .limit(50);
  return rows.map(({ publishedJson, draftJson, ...row }) => ({
    ...row,
    businessSummary: workflowBusinessSummary(
      JSON.parse(publishedJson ?? draftJson) as WorkflowGraph,
    ),
    trigger: publishedJson
      ? workflowTrigger(JSON.parse(publishedJson) as WorkflowGraph)
      : workflowTrigger(JSON.parse(draftJson) as WorkflowGraph),
    hasPreparation:
      !!publishedJson &&
      (JSON.parse(publishedJson) as WorkflowGraph).nodes.some(
        (n) => n.kind === "assign_forms",
      ),
    hasTelegram:
      !!publishedJson &&
      (JSON.parse(publishedJson) as WorkflowGraph).nodes.some(
        (n) => n.kind === "send_telegram",
      ),
  }));
}
export async function getWorkflow(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, id), eq(workflows.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) fail("Workflow not found.", 404);
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    version: row.version,
    updatedAt: row.updatedAt,
    draft: JSON.parse(row.draftJson) as WorkflowGraph,
    archived: await isArchived("workflow", row.id),
    published: row.publishedJson
      ? (JSON.parse(row.publishedJson) as WorkflowGraph)
      : null,
  };
}
export async function createWorkflow(
  ownerEmail: string,
  trigger: WorkflowTrigger = "staff_upload",
  preset?: WorkflowPreset,
) {
  if ((await listWorkflows(ownerEmail)).length >= 50)
    fail("You can create up to 50 workflows.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const graph = preset ? presetGraph(preset) : isApplicationTrigger(trigger) ? applicationGraph(trigger) : defaultGraph();
  graph.nodes.find((n) => n.kind === "resume_uploaded")!.config.trigger =
    trigger;
  await getDb().batch([
    getDb()
      .insert(workflows)
      .values({
        id,
        ownerEmail,
        name: preset ? WORKFLOW_PRESETS[preset].name : "Candidate preparation",
        draftJson: JSON.stringify(graph),
        createdAt: now,
        updatedAt: now,
      }),
    workflowAudit(ownerEmail, "workflow.created", id),
  ]);
  return getWorkflow(ownerEmail, id);
}

export async function templateOptions(
  ownerEmail: string,
): Promise<TemplateOption[]> {
  const rows = await getDb()
    .select({
      id: templates.id,
      name: templates.name,
      roles: templateVersions.rolesJson,
      kind: templates.kind,
    })
    .from(templates)
    .innerJoin(
      templateVersions,
      eq(templates.currentVersionId, templateVersions.id),
    )
    .where(
      and(eq(templates.ownerEmail, ownerEmail), isNull(templates.archivedAt)),
    )
    .orderBy(templates.name)
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as "pdf" | "form",
    roles: parseVersionRoles(r.roles).map((role) => ({
      id: role.id,
      name: role.name,
    })),
  }));
}

export async function saveWorkflow(
  ownerEmail: string,
  id: string,
  body: Record<string, unknown>,
) {
  const current = await getWorkflow(ownerEmail, id);
  if (await isArchived("workflow", id))
    fail("Restore this workflow from Archive before editing it.", 409);
  if (body.expectedUpdatedAt !== current.updatedAt)
    fail("This workflow changed. Reload before saving.", 409);
  if (body.action === "pause") {
    const [paused] = await getDb()
      .update(workflows)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(workflows.id, id),
          eq(workflows.ownerEmail, ownerEmail),
          eq(workflows.updatedAt, current.updatedAt),
          notArchived("workflow", workflows.id),
        ),
      )
      .returning({ id: workflows.id });
    if (!paused) fail("This workflow changed. Reload before saving.", 409);
    await workflowAudit(ownerEmail, "workflow.paused", id);
    return getWorkflow(ownerEmail, id);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const graph =
    body.action === "publish"
      ? parseGraph(body.graph)
      : parseDraftGraph(body.graph);
  if (!name || name.length > 120 || !graph)
    fail("Enter a name and a valid workflow configuration.");
  const publishing = body.action === "publish";
  const draftJson = JSON.stringify(graph);
  if (!publishing && body.action !== "save")
    fail("Choose save, publish, or pause.");
  if (publishing) {
    await validateApplicationGraph(ownerEmail, graph);
    const issues = graphIssues(graph);
    if (issues.length) fail(issues.join(" "), 422);
    // Published runs pin template versions and roles, independently of later edits.
    for (const n of graph.nodes.filter((n) => n.kind === "assign_forms")) {
      for (const target of n.config.forms ?? []) {
        const [t] = await getDb()
          .select({ template: templates, version: templateVersions })
          .from(templates)
          .innerJoin(
            templateVersions,
            eq(templates.currentVersionId, templateVersions.id),
          )
          .where(
            and(
              eq(templates.id, target.templateId),
              eq(templates.ownerEmail, ownerEmail),
              isNull(templates.archivedAt),
            ),
          )
          .limit(1);
        if (
          !t ||
          !parseVersionRoles(t.version.rolesJson).some(
            (r) => r.id === target.roleId,
          )
        )
          fail(
            "A selected template or role is unavailable. Refresh the selections.",
            422,
          );
        target.versionId = t.version.id;
        target.name = t.template.name;
      }
    }
  }
  const now = new Date().toISOString();
  const [saved] = await getDb()
    .update(workflows)
    .set({
      name,
      draftJson,
      ...(publishing
        ? {
            publishedJson: JSON.stringify(graph),
            version: current.version + 1,
            active: true,
          }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(workflows.id, id),
        eq(workflows.ownerEmail, ownerEmail),
        eq(workflows.updatedAt, current.updatedAt),
        notArchived("workflow", workflows.id),
      ),
    )
    .returning({ id: workflows.id });
  if (!saved) fail("This workflow changed. Reload before saving.", 409);
  await workflowAudit(
    ownerEmail,
    publishing ? "workflow.published" : "workflow.saved",
    id,
    { version: publishing ? current.version + 1 : current.version },
  );
  return getWorkflow(ownerEmail, id);
}

// Included in the same D1 transaction as the staff upload: a run cannot be lost
// between storing the CV and enqueueing the workflow.
export async function uploadWorkflowStatements(
  ownerEmail: string,
  resumeId: string,
  now: string,
  event: WorkflowTrigger = "staff_upload",
  context: RunContext = { steps: {} },
) {
  if(event === "resume_verified" && await getDatabaseBinding().prepare("SELECT id FROM hiring_applications WHERE owner_email=? AND resume_id=? AND outcome IS NULL AND json_extract(evidence_json,'$.preparationMode')='application' LIMIT 1").bind(ownerEmail,resumeId).first()) return [];
  const rows = await getDb()
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.ownerEmail, ownerEmail),
        eq(workflows.active, true),
        notArchived("workflow", workflows.id),
      ),
    )
    .orderBy(workflows.id)
    .limit(50);
  return rows.flatMap((w) => {
    if (!w.publishedJson) return [];
    const graph = JSON.parse(w.publishedJson) as WorkflowGraph;
    const start = graph.nodes.find((n) => n.kind === "resume_uploaded");
    if (!start || workflowTrigger(graph) !== event) return [];
    return [
      getDb()
        .insert(workflowRuns)
        .values({
          id: crypto.randomUUID(),
          workflowId: w.id,
          ownerEmail,
          workflowName: w.name,
          version: w.version,
          resumeId,
          graphJson: w.publishedJson,
          contextJson: JSON.stringify(context),
          currentNodeId: start.id,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing(),
    ];
  });
}

export async function startWorkflow(
  ownerEmail: string,
  workflowId: string,
  resumeId: string,
  context: RunContext = { steps: {} },
) {
  const [w] = await getDb()
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.id, workflowId),
        eq(workflows.ownerEmail, ownerEmail),
        notArchived("workflow", workflows.id),
      ),
    )
    .limit(1);
  const [r] = await getDb()
    .select({ id: resumes.id })
    .from(resumes)
    .where(
      and(
        eq(resumes.id, resumeId),
        eq(resumes.ownerEmail, ownerEmail),
        notArchived("resume", resumes.id),
      ),
    )
    .limit(1);
  if (!w?.publishedJson || !r)
    fail("Choose a published workflow and an existing resume.", 422);
  const graph = JSON.parse(w.publishedJson) as WorkflowGraph;
  if (isApplicationTrigger(workflowTrigger(graph))) fail("Application workflows start from application events. Add or move an application on the hiring board.", 422);
  const now = new Date().toISOString();
  if (
    context.resumeEditorApproval &&
    !graph.nodes.some((n) => n.kind === "send_telegram")
  )
    fail("Choose a workflow with a Telegram invitation step.", 422);
  const id = crypto.randomUUID();
  await getDb()
    .insert(workflowRuns)
    .values({
      id,
      workflowId,
      ownerEmail,
      workflowName: w.name,
      version: w.version,
      resumeId,
      graphJson: w.publishedJson,
      contextJson: JSON.stringify(context),
      currentNodeId: graph.nodes.find((n) => n.kind === "resume_uploaded")!.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const [run] = await getDb()
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.workflowId, workflowId),
        eq(workflowRuns.resumeId, resumeId),
        isNull(workflowRuns.eventId),
        isNull(workflowRuns.applicationId),
        eq(workflowRuns.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  if(!run)fail("Preparation for this CV is owned by its hiring application. Open CV & documents in Hiring pipeline.",409);
  return run.id;
}

const runSelection = {
  run: workflowRuns,
  fileName: resumes.fileName,
  candidateName: candidates.fullName,
};
function serializeRun(row: {
  run: typeof workflowRuns.$inferSelect;
  fileName: string | null;
  candidateName: string | null;
}): WorkflowRun {
  const r = row.run;
  return {
    id: r.id,
    workflowId: r.workflowId,
    workflowName: r.workflowName,
    version: r.version,
    resumeId: r.resumeId,
    fileName: row.fileName ?? "Resume removed",
    candidateName: row.candidateName ?? "Unlinked candidate",
    status: r.status as RunStatus,
    currentNodeId: r.currentNodeId,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    graph: JSON.parse(r.graphJson) as WorkflowGraph,
    context: JSON.parse(r.contextJson) as RunContext,
  };
}
export async function getRun(ownerEmail: string, id: string) {
  const [row] = await getDb()
    .select(runSelection)
    .from(workflowRuns)
    .leftJoin(
      resumes,
      and(
        eq(workflowRuns.resumeId, resumes.id),
        eq(resumes.ownerEmail, ownerEmail),
      ),
    )
    .leftJoin(
      candidates,
      and(
        eq(resumes.candidateId, candidates.id),
        eq(candidates.ownerEmail, ownerEmail),
      ),
    )
    .where(
      and(eq(workflowRuns.id, id), eq(workflowRuns.ownerEmail, ownerEmail)),
    )
    .limit(1);
  if (!row) fail("Workflow run not found.", 404);
  return serializeRun(row);
}
export async function listRuns(ownerEmail: string, query: URLSearchParams) {
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(query.get("page"))) || 1),
  );
  const days = Number(query.get("days"));
  const dateFilter = [1, 7, 30].includes(days)
    ? gte(
        workflowRuns.createdAt,
        new Date(Date.now() - days * 86400000).toISOString(),
      )
    : undefined;
  const filters = [
    eq(workflowRuns.ownerEmail, ownerEmail),
    notArchived("workflow_run", workflowRuns.id),
  ];
  if (dateFilter) filters.push(dateFilter);
  if (query.get("workflowId"))
    filters.push(eq(workflowRuns.workflowId, query.get("workflowId")!));
  if (query.get("status"))
    filters.push(eq(workflowRuns.status, query.get("status")!));
  const search = query.get("search")?.trim().slice(0, 120);
  if (search)
    filters.push(
      or(
        like(resumes.fileName, `%${search}%`),
        like(candidates.fullName, `%${search}%`),
      )!,
    );
  const db = getDb();
  const [rows, totals, stats] = await Promise.all([
    db
      .select(runSelection)
      .from(workflowRuns)
      .leftJoin(
        resumes,
        and(
          eq(workflowRuns.resumeId, resumes.id),
          eq(resumes.ownerEmail, ownerEmail),
        ),
      )
      .leftJoin(
        candidates,
        and(
          eq(resumes.candidateId, candidates.id),
          eq(candidates.ownerEmail, ownerEmail),
        ),
      )
      .where(and(...filters))
      .orderBy(desc(workflowRuns.createdAt), desc(workflowRuns.id))
      .limit(20)
      .offset((page - 1) * 20),
    db
      .select({ total: count() })
      .from(workflowRuns)
      .leftJoin(
        resumes,
        and(
          eq(workflowRuns.resumeId, resumes.id),
          eq(resumes.ownerEmail, ownerEmail),
        ),
      )
      .leftJoin(
        candidates,
        and(
          eq(resumes.candidateId, candidates.id),
          eq(candidates.ownerEmail, ownerEmail),
        ),
      )
      .where(and(...filters)),
    db
      .select({ status: workflowRuns.status, total: count() })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.ownerEmail, ownerEmail),
          query.get("workflowId")
            ? eq(workflowRuns.workflowId, query.get("workflowId")!)
            : undefined,
          dateFilter,
        ),
      )
      .groupBy(workflowRuns.status),
  ]);
  return {
    items: rows.map(serializeRun),
    total: totals[0]?.total ?? 0,
    page,
    pageSize: 20,
    stats: Object.fromEntries(stats.map((s) => [s.status, s.total])),
  };
}

export async function claimRun(
  id: string,
  statuses: string[] = ["queued", "running"],
) {
  const now = new Date().toISOString();
  const token = crypto.randomUUID();
  const [row] = await getDb()
    .update(workflowRuns)
    .set({
      lockToken: token,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: "running",
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowRuns.id, id),
        or(...statuses.map((s) => eq(workflowRuns.status, s))),
        or(isNull(workflowRuns.lockedUntil), lt(workflowRuns.lockedUntil, now)),
      ),
    )
    .returning();
  return row ? { row, token } : null;
}

export async function duplicateWorkflow(ownerEmail: string, id: string) {
  const source = await getWorkflow(ownerEmail, id);
  if (source.archived)
    fail("Restore this workflow before duplicating it.", 409);
  if ((await listWorkflows(ownerEmail)).length >= 50)
    fail("You can create up to 50 workflows.");
  const graph = parseDraftGraph(source.draft);
  if (!graph) fail("This draft could not be duplicated.", 422);
  const copyId = crypto.randomUUID(),
    now = new Date().toISOString();
  await getDb().batch([
    getDb()
      .insert(workflows)
      .values({
        id: copyId,
        ownerEmail,
        name: (source.name + " (copy)").slice(0, 120),
        draftJson: JSON.stringify(graph),
        active: false,
        version: 0,
        createdAt: now,
        updatedAt: now,
      }),
    workflowAudit(ownerEmail, "workflow.duplicated", copyId, { sourceId: id }),
  ]);
  return getWorkflow(ownerEmail, copyId);
}

export async function publishedVersions(ownerEmail: string, id: string) {
  await getWorkflow(ownerEmail, id);
  return getDb()
    .select({
      version: workflowVersions.version,
      name: workflowVersions.name,
      publishedAt: workflowVersions.publishedAt,
      graph: workflowVersions.graphJson,
    })
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.workflowId, id),
        eq(workflowVersions.ownerEmail, ownerEmail),
      ),
    )
    .orderBy(desc(workflowVersions.version));
}
export async function restorePublishedDraft(
  ownerEmail: string,
  id: string,
  body: Record<string, unknown>,
) {
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1)
    fail("Choose a published version.");
  const [version] = await getDb()
    .select()
    .from(workflowVersions)
    .where(
      and(
        eq(workflowVersions.workflowId, id),
        eq(workflowVersions.ownerEmail, ownerEmail),
        eq(workflowVersions.version, Number(body.version)),
      ),
    )
    .limit(1);
  if (!version) fail("Published version not found.", 404);
  // Normal draft parsing clears pinned template versions; publication validates and pins again.
  return saveWorkflow(ownerEmail, id, {
    action: "save",
    expectedUpdatedAt: body.expectedUpdatedAt,
    name: version.name,
    graph: JSON.parse(version.graphJson),
  });
}
