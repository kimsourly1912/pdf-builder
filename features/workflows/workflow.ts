import type { ResumeCandidateSummary } from "@/features/resumes/resume.types";

export const STEP_KINDS = [
  "resume_uploaded",
  "extract_resume",
  "review_resume",
  "create_account",
  "link_resume",
  "assign_forms",
  "send_telegram",
  "condition",
  "complete",
  "stop",
] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export type FormTarget = {
  templateId: string;
  roleId: string;
  versionId?: string;
  name?: string;
};
export const WORKFLOW_TRIGGERS = [
  "staff_upload",
  "telegram_submission",
  "resume_verified",
  "manual",
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];
export const TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  staff_upload: "Staff uploads a CV",
  telegram_submission: "Telegram candidate submits a CV",
  resume_verified: "HR verifies a CV",
  manual: "HR starts manually",
};
export type ResumeEditorApproval = {
  resumeRevision: string;
  candidateRevision: string;
  profileVersionId: string;
  existingAccountId?: string;
};
export function workflowTrigger(graph: WorkflowGraph): WorkflowTrigger {
  return (
    graph.nodes.find((n) => n.kind === "resume_uploaded")?.config.trigger ??
    "staff_upload"
  );
}
export type StepConfig = {
  trigger?: WorkflowTrigger;
  forms?: FormTarget[];
  skipExisting?: boolean;
  field?: "source" | "appliedPosition";
  value?: string;
  message?: string;
};
export type WorkflowNode = {
  id: string;
  kind: StepKind;
  position: { x: number; y: number };
  config: StepConfig;
  label?: string;
  note?: string;
};
export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  outcome: "next" | "approved" | "rejected" | "yes" | "no";
};
export type WorkflowGraph = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
export type RunStatus =
  "queued" | "running" | "waiting_review" | "completed" | "rejected" | "failed";
export type StepResult = {
  status: "completed" | "waiting" | "failed";
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  note?: string;
  outcome?: WorkflowEdge["outcome"];
};
export type RunContext = {
  reviewStartedAt?: string;
  preparationCompletedAt?: string;
  steps: Record<string, StepResult>;
  resumeEditorApproval?: ResumeEditorApproval;
  activationRequired?: boolean;
  telegramConnectionId?: string;
  telegramChatId?: string;
  waitingFor?: "telegram" | "telegram_retry";
  userId?: string;
  candidateId?: string;
  profileVersionId?: string;
  reviewedName?: string;
  reviewedEmail?: string;
  reviewer?: string;
  reviewedAt?: string;
  reviewNote?: string;
  rejection?: boolean;
  approvedCandidate?: ResumeCandidateSummary;
};
export type WorkflowSummary = {
  trigger?: WorkflowTrigger;
  id: string;
  name: string;
  active: boolean;
  version: number;
  updatedAt: string;
  latestRunId?: string | null;
  latestRunStatus?: RunStatus | null;
  latestRunAt?: string | null;
  latestRunWaitingFor?: string | null;
};
export type WorkflowDetail = WorkflowSummary & {
  draft: WorkflowGraph;
  archived?: boolean;
  published?: WorkflowGraph | null;
};
export type WorkflowRun = {
  id: string;
  workflowId: string;
  workflowName: string;
  version: number;
  resumeId: string;
  fileName: string;
  candidateName: string;
  status: RunStatus;
  currentNodeId: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  graph: WorkflowGraph;
  context: RunContext;
};
export type TemplateOption = {
  kind?: "pdf" | "form";
  id: string;
  name: string;
  roles: { id: string; name: string }[];
};

export const STEP_LABELS: Record<StepKind, string> = {
  resume_uploaded: "Start with resume",
  extract_resume: "Prepare resume data",
  review_resume: "Review resume",
  create_account: "Create candidate account",
  link_resume: "Link resume",
  assign_forms: "Assign forms",
  send_telegram: "Send Telegram invitation",
  condition: "Condition",
  complete: "Complete",
  stop: "Stop",
};
export const STEP_DESCRIPTIONS: Record<StepKind, string> = {
  resume_uploaded: "Choose the event that starts this workflow",
  extract_resume: "Reuse saved data or review manually; AI is optional",
  review_resume: "Pause for manual approval",
  create_account: "Create or use a reviewed account",
  link_resume: "Attach the approved resume",
  assign_forms: "Assign templates with resume mappings",
  send_telegram: "Send account access to a confirmed Telegram contact",
  condition: "Branch by source or applied position",
  complete: "Workflow complete",
  stop: "End this workflow",
};

export function defaultGraph(): WorkflowGraph {
  const kinds: StepKind[] = [
    "resume_uploaded",
    "extract_resume",
    "review_resume",
    "create_account",
    "link_resume",
    "assign_forms",
    "complete",
    "stop",
  ];
  const ids = [
    "upload",
    "extract",
    "review",
    "account",
    "link",
    "assign",
    "done",
    "stop",
  ];
  return {
    nodes: kinds.map((kind, i) => ({
      id: ids[i],
      kind,
      position: i === 7 ? { x: -260, y: 390 } : { x: 80, y: i * 130 },
      config: kind === "assign_forms" ? { forms: [], skipExisting: true } : {},
    })),
    edges: [
      {
        id: "upload-extract",
        source: "upload",
        target: "extract",
        outcome: "next",
      },
      {
        id: "extract-review",
        source: "extract",
        target: "review",
        outcome: "next",
      },
      {
        id: "review-account",
        source: "review",
        target: "account",
        outcome: "approved",
      },
      {
        id: "review-stop",
        source: "review",
        target: "stop",
        outcome: "rejected",
      },
      {
        id: "account-link",
        source: "account",
        target: "link",
        outcome: "next",
      },
      { id: "link-assign", source: "link", target: "assign", outcome: "next" },
      { id: "assign-done", source: "assign", target: "done", outcome: "next" },
    ],
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === "object";
}
function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}

// Normalize untrusted graphs before storing them. Drafts may be incomplete.
export function parseGraph(
  value: unknown,
  draft = false,
): WorkflowGraph | null {
  if (
    !record(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    value.nodes.length > 32 ||
    value.edges.length > 64
  )
    return null;
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  for (const n of value.nodes) {
    if (
      !record(n) ||
      !validId(n.id) ||
      !STEP_KINDS.includes(n.kind as StepKind) ||
      !record(n.position) ||
      typeof n.position.x !== "number" ||
      typeof n.position.y !== "number" ||
      !Number.isFinite(n.position.x) ||
      !Number.isFinite(n.position.y) ||
      Math.abs(n.position.x) > 100000 ||
      Math.abs(n.position.y) > 100000 ||
      !record(n.config)
    )
      return null;
    const config: StepConfig = {};
    if (n.kind === "assign_forms") {
      if (!Array.isArray(n.config.forms) || n.config.forms.length > 20)
        return null;
      const forms: FormTarget[] = [];
      for (const f of n.config.forms) {
        if (
          !record(f) ||
          (f.templateId !== "" && !validId(f.templateId)) ||
          (f.roleId !== "" && !validId(f.roleId))
        )
          return null;
        forms.push({ templateId: f.templateId, roleId: f.roleId });
      }
      config.forms = forms;
      config.skipExisting = n.config.skipExisting !== false;
    }
    if (n.kind === "resume_uploaded") {
      if (
        n.config.trigger !== undefined &&
        !WORKFLOW_TRIGGERS.includes(n.config.trigger as WorkflowTrigger)
      )
        return null;
      config.trigger =
        (n.config.trigger as WorkflowTrigger | undefined) ?? "staff_upload";
    }
    if (n.kind === "send_telegram") {
      if (
        n.config.message !== undefined &&
        (typeof n.config.message !== "string" ||
          (!draft && !n.config.message.trim()) ||
          n.config.message.length > 2000)
      )
        return null;
      config.message =
        typeof n.config.message === "string"
          ? draft
            ? n.config.message
            : n.config.message.trim()
          : undefined;
    }
    if (n.kind === "condition") {
      if (n.config.field !== "source" && n.config.field !== "appliedPosition")
        return null;
      if (typeof n.config.value !== "string" || n.config.value.length > 160)
        return null;
      config.field = n.config.field;
      config.value = n.config.value.trim();
    }
    if (
      (n.label !== undefined &&
        (typeof n.label !== "string" || n.label.length > 80)) ||
      (n.note !== undefined &&
        (typeof n.note !== "string" || n.note.length > 2000))
    )
      return null;
    nodes.push({
      ...(typeof n.label === "string" && n.label.trim()
        ? { label: n.label.trim() }
        : {}),
      ...(typeof n.note === "string" && n.note ? { note: n.note } : {}),
      id: n.id,
      kind: n.kind as StepKind,
      position: { x: n.position.x, y: n.position.y },
      config,
    });
  }
  for (const e of value.edges) {
    if (
      !record(e) ||
      !validId(e.id) ||
      !validId(e.source) ||
      !validId(e.target) ||
      !["next", "approved", "rejected", "yes", "no"].includes(String(e.outcome))
    )
      return null;
    edges.push({
      id: e.id,
      source: e.source,
      target: e.target,
      outcome: e.outcome as WorkflowEdge["outcome"],
    });
  }
  if (
    new Set(nodes.map((n) => n.id)).size !== nodes.length ||
    new Set(edges.map((e) => e.id)).size !== edges.length
  )
    return null;
  return { nodes, edges };
}

export function graphIssues(graph: WorkflowGraph): string[] {
  const issues = new Set<string>();
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  const starts = graph.nodes.filter((n) => n.kind === "resume_uploaded");
  if (starts.length !== 1)
    issues.add("Add exactly one workflow starting event.");
  for (const kind of [
    "extract_resume",
    "review_resume",
    "complete",
  ] as StepKind[]) {
    if (!graph.nodes.some((n) => n.kind === kind))
      issues.add(`Add a ${STEP_LABELS[kind]} step.`);
  }
  for (const e of graph.edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target))
      issues.add("Remove connections to missing steps.");
    if (nodeMap.get(e.target)?.kind === "resume_uploaded")
      issues.add("The starting event cannot have incoming connections.");
  }
  for (const n of graph.nodes) {
    const outgoing = graph.edges.filter((e) => e.source === n.id);
    const expected =
      n.kind === "review_resume"
        ? ["approved", "rejected"]
        : n.kind === "condition"
          ? ["yes", "no"]
          : ["complete", "stop"].includes(n.kind)
            ? []
            : ["next"];
    if (
      outgoing.length !== expected.length ||
      expected.some((o) => outgoing.filter((e) => e.outcome === o).length !== 1)
    )
      issues.add(
        `${STEP_LABELS[n.kind]} needs ${expected.length ? expected.join(" and ") + " connections" : "no outgoing connections"}.`,
      );
    if (n.kind === "assign_forms") {
      const forms = n.config.forms ?? [];
      if (!forms.length)
        issues.add("Select at least one template and recipient role.");
      if (forms.some((f) => !validId(f.templateId) || !validId(f.roleId)))
        issues.add(
          "Choose a template and recipient role for every form selection.",
        );
      if (
        new Set(forms.map((f) => f.templateId + ":" + f.roleId)).size !==
        forms.length
      )
        issues.add("Remove duplicate template and role selections.");
    }
    if (
      n.kind === "send_telegram" &&
      n.config.message !== undefined &&
      !n.config.message.trim()
    )
      issues.add("Enter a Telegram invitation message.");
    if (n.kind === "condition" && !n.config.value?.trim())
      issues.add("Enter a value for each condition.");
  }
  const reached = new Set<string>();
  let visitedPaths = 0;
  function walk(
    id: string,
    path: Set<string>,
    state: Set<StepKind>,
    rejected: boolean,
  ) {
    if (++visitedPaths > 256) {
      issues.add("Simplify the workflow to fewer branches.");
      return;
    }
    if (path.has(id)) {
      issues.add(
        "Workflow loops are not supported. Remove the circular connection.",
      );
      return;
    }
    const n = nodeMap.get(id);
    if (!n) return;
    reached.add(id);
    if (rejected && n.kind !== "stop")
      issues.add("Rejected reviews must connect directly to Stop.");
    if (n.kind === "review_resume" && !state.has("extract_resume"))
      issues.add(
        "Prepare saved resume data before manual review. AI extraction is optional.",
      );
    if (
      [
        "create_account",
        "link_resume",
        "assign_forms",
        "send_telegram",
      ].includes(n.kind) &&
      !state.has("review_resume")
    )
      issues.add(
        "Every account or assignment path must pass an approved review.",
      );
    if (n.kind === "link_resume" && !state.has("create_account"))
      issues.add("Create or resolve the account before linking the resume.");
    if (n.kind === "send_telegram" && !state.has("assign_forms"))
      issues.add("Assign forms before sending a Telegram invitation.");
    if (n.kind === "assign_forms" && !state.has("link_resume"))
      issues.add("Link the resume before assigning forms.");
    if (
      state.has(n.kind) &&
      [
        "extract_resume",
        "review_resume",
        "create_account",
        "link_resume",
        "assign_forms",
        "send_telegram",
      ].includes(n.kind)
    )
      issues.add("Use each candidate preparation action only once per path.");
    const nextState = new Set(state);
    nextState.add(n.kind);
    const nextPath = new Set(path);
    nextPath.add(id);
    for (const e of graph.edges.filter((e) => e.source === id))
      walk(e.target, nextPath, nextState, rejected || e.outcome === "rejected");
  }
  if (starts.length === 1) walk(starts[0].id, new Set(), new Set(), false);
  if (graph.nodes.some((n) => !reached.has(n.id)))
    issues.add("Connect all steps to the starting event.");
  return [...issues];
}

export function nextNode(
  graph: WorkflowGraph,
  nodeId: string,
  outcome: WorkflowEdge["outcome"] = "next",
): string {
  const edge = graph.edges.find(
    (e) => e.source === nodeId && e.outcome === outcome,
  );
  if (!edge) throw new Error("This workflow has a missing connection.");
  return edge.target;
}

export function conditionMatches(
  config: StepConfig,
  resume: { source: string; appliedPosition: string },
): boolean {
  return (
    (resume[config.field ?? "source"] ?? "").trim().toLowerCase() ===
    (config.value ?? "").trim().toLowerCase()
  );
}

export function parseDraftGraph(value: unknown) {
  return parseGraph(value, true);
}
