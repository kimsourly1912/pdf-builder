import {
  STEP_LABELS,
  type StepKind,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowEdge,
} from "./workflow";
export const DEFAULT_INVITATION =
  "Hello {name}, your PDF Studio account is ready. Email: {email}. You have {formCount} assigned forms.";
export function outcomes(kind: StepKind): WorkflowEdge["outcome"][] {
  return kind === "review_resume"
    ? ["approved", "rejected"]
    : kind === "condition"
      ? ["yes", "no"]
      : kind === "complete" || kind === "stop"
        ? []
        : ["next"];
}
export function connectionIssue(
  graph: WorkflowGraph,
  source: string,
  target: string,
  outcome: WorkflowEdge["outcome"],
  excluding?: string,
): string | null {
  const from = graph.nodes.find((n) => n.id === source),
    to = graph.nodes.find((n) => n.id === target);
  if (!from || !to) return "Choose an existing source and destination step.";
  if (source === target || to.kind === "resume_uploaded")
    return "A step cannot connect to itself or to the starting event.";
  if (!outcomes(from.kind).includes(outcome))
    return "Choose a valid output branch.";
  if (
    from.kind === "review_resume" &&
    outcome === "rejected" &&
    to.kind !== "stop"
  )
    return "Rejected CVs must go directly to Stop.";
  const edges = graph.edges.filter((e) => e.id !== excluding);
  if (edges.some((e) => e.source === source && e.outcome === outcome))
    return "This output already has a connection. Reconnect its line or insert a step with +.";
  const seen = new Set<string>(),
    stack = [target];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source)
      return "This connection would create a loop. Choose a later step.";
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...edges.filter((e) => e.source === id).map((e) => e.target));
  }
  return null;
}
export function newStep(
  kind: StepKind,
  position: WorkflowNode["position"],
  id = crypto.randomUUID(),
): WorkflowNode {
  return {
    id,
    kind,
    position,
    config:
      kind === "assign_forms"
        ? { forms: [], skipExisting: true }
        : kind === "condition"
          ? { field: "source", value: "" }
          : kind === "send_telegram"
            ? { message: DEFAULT_INVITATION }
            : {},
  };
}
export function insertStep(
  graph: WorkflowGraph,
  node: WorkflowNode,
  source?: string,
  outcome: WorkflowEdge["outcome"] = "next",
) {
  if (graph.nodes.length >= 32)
    throw Error("A workflow can contain up to 32 steps.");
  if (node.kind === "resume_uploaded")
    throw Error("Each workflow has one starting event.");
  if (!source) return { ...graph, nodes: [...graph.nodes, node] };
  const parent = graph.nodes.find((n) => n.id === source);
  if (!parent) throw Error("Select a source step.");
  if (!outcomes(parent.kind).includes(outcome))
    throw Error("Choose an available output.");
  if (
    parent.kind === "review_resume" &&
    outcome === "rejected" &&
    node.kind !== "stop"
  )
    throw Error("Rejected CVs must go directly to Stop.");
  const old = graph.edges.find(
    (e) => e.source === source && e.outcome === outcome,
  );
  if (old && !outcomes(node.kind).length)
    throw Error(
      "A terminal step cannot be inserted into an existing connection. Disconnect that branch first.",
    );
  const edges = graph.edges.filter((e) => e.id !== old?.id);
  edges.push({ id: crypto.randomUUID(), source, target: node.id, outcome });
  if (old)
    edges.push({
      id: crypto.randomUUID(),
      source: node.id,
      target: old.target,
      outcome: outcomes(node.kind)[0],
    });
  return { ...graph, nodes: [...graph.nodes, node], edges };
}
export function removeSteps(
  graph: WorkflowGraph,
  ids: string[],
  edgeIds: string[] = [],
): WorkflowGraph {
  const removable = new Set(
    ids.filter(
      (id) => graph.nodes.find((n) => n.id === id)?.kind !== "resume_uploaded",
    ),
  );
  return {
    nodes: graph.nodes.filter((n) => !removable.has(n.id)),
    edges: graph.edges.filter(
      (e) =>
        !removable.has(e.source) &&
        !removable.has(e.target) &&
        !edgeIds.includes(e.id),
    ),
  };
}
export function arrangeGraph(graph: WorkflowGraph): WorkflowGraph {
  const depth = new Map(graph.nodes.map((n) => [n.id, 0]));
  // Bounded relaxation also handles unfinished drafts with cycles without hanging.
  for (let i = 0; i < graph.nodes.length; i++) {
    let changed = false;
    for (const e of graph.edges) {
      const d = Math.min(
        graph.nodes.length - 1,
        (depth.get(e.source) ?? 0) + 1,
      );
      if (depth.has(e.target) && d > (depth.get(e.target) ?? 0)) {
        depth.set(e.target, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows = new Map<number, number>();
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const column = depth.get(n.id) ?? 0,
        row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      return { ...n, position: { x: column * 340, y: row * 200 } };
    }),
  };
}
export function nodeIssues(graph: WorkflowGraph, node: WorkflowNode): string[] {
  const issues: string[] = [];
  for (const outcome of outcomes(node.kind))
    if (!graph.edges.some((e) => e.source === node.id && e.outcome === outcome))
      issues.push(
        `Connect ${outcome === "next" ? "the next step" : `the ${outcome} branch`}.`,
      );
  if (
    node.kind !== "resume_uploaded" &&
    !graph.edges.some((e) => e.target === node.id)
  )
    issues.push("Connect this step to the workflow.");
  if (
    node.kind === "assign_forms" &&
    (!node.config.forms?.length ||
      node.config.forms.some((f) => !f.templateId || !f.roleId))
  )
    issues.push("Choose a published form for every assignment.");
  if (node.kind === "condition" && !node.config.value?.trim())
    issues.push("Enter a value to compare.");
  if (
    node.kind === "send_telegram" &&
    node.config.message !== undefined &&
    !node.config.message.trim()
  )
    issues.push("Enter an invitation message.");
  return issues;
}
export const DATA_HELP: Record<StepKind, { input: string; output: string }> = {
  move_stage: { input: "Application, expected source stage and current evidence.", output: "A guarded stage transition and its recorded event." },
  resume_uploaded: {
    input: "The selected starting event and its CV.",
    output: "Candidate and CV references for this run.",
  },
  extract_resume: {
    input: "Stored CV details or a manually reviewed CV.",
    output: "Saved candidate details. This step never requests paid AI.",
  },
  review_resume: {
    input: "Candidate details and the original CV.",
    output:
      "HR approval or rejection. Preparation requires the approved branch.",
  },
  create_account: {
    input: "Approved profile and confirmed account details.",
    output: "New account or explicitly confirmed existing account.",
  },
  link_resume: {
    input: "Approved CV and candidate account.",
    output: "The CV linked to that account.",
  },
  assign_forms: {
    input: "Linked account, approved data and selected published forms.",
    output: "Pinned form assignments; previous assignments can be preserved.",
  },
  send_telegram: {
    input: "Assigned forms and an HR-confirmed Telegram contact.",
    output: "Invitation delivery result. Sent does not mean read.",
  },
  condition: {
    input: "CV source or applied position.",
    output: "Yes or No according to the configured comparison.",
  },
  complete: {
    input: "The preceding completed preparation steps.",
    output:
      "Workflow completion. Candidate form submission is tracked separately.",
  },
  stop: {
    input: "The branch leading here, including rejected CVs.",
    output: "Workflow ends without continuing this branch.",
  },
};
export function nodeLabel(node: WorkflowNode) {
  return STEP_LABELS[node.kind];
}
