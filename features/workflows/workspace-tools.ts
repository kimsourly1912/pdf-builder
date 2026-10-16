import {
  graphIssues,
  parseDraftGraph,
  STEP_LABELS,
  TRIGGER_LABELS,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowRun,
  type TemplateOption,
} from "./workflow";
import { DEFAULT_INVITATION } from "./editor-tools";
export function displayNode(
  node: Pick<WorkflowNode, "kind" | "label"> &
    Partial<Pick<WorkflowNode, "config">>,
) {
  return (
    node.label ||
    (node.kind === "resume_uploaded"
      ? TRIGGER_LABELS[node.config?.trigger ?? "staff_upload"]
      : STEP_LABELS[node.kind])
  );
}
export function graphIdentity(graph: WorkflowGraph | null | undefined) {
  return graph ? JSON.stringify(parseDraftGraph(graph)) : "";
}
export function graphChanges(
  before: WorkflowGraph | null | undefined,
  after: WorkflowGraph,
): string[] {
  if (!before)
    return [
      `Initial publication: ${after.nodes.length} steps and ${after.edges.length} connections.`,
    ];
  const changes: string[] = [];
  for (const n of after.nodes) {
    const old = before.nodes.find((o) => o.id === n.id);
    if (!old) changes.push(`Added ${displayNode(n)}.`);
    else {
      if (old.label !== n.label || old.note !== n.note)
        changes.push(`Updated name or annotation: ${displayNode(n)}.`);
      if (
        JSON.stringify(
          parseDraftGraph({ nodes: [old], edges: [] })?.nodes[0].config,
        ) !==
        JSON.stringify(
          parseDraftGraph({ nodes: [n], edges: [] })?.nodes[0].config,
        )
      )
        changes.push(`Changed settings: ${displayNode(n)}.`);
      if (old.position.x !== n.position.x || old.position.y !== n.position.y)
        changes.push(`Moved ${displayNode(n)}.`);
    }
  }
  for (const n of before.nodes)
    if (!after.nodes.some((o) => o.id === n.id))
      changes.push(`Removed ${displayNode(n)}.`);
  if (JSON.stringify(before.edges) !== JSON.stringify(after.edges))
    changes.push("Changed workflow connections.");
  return changes;
}
export const STEP_GROUPS = [
  {
    name: "Candidate",
    kinds: ["extract_resume", "review_resume", "create_account", "link_resume"],
  },
  { name: "Forms", kinds: ["assign_forms"] },
  { name: "Communication", kinds: ["send_telegram"] },
  { name: "Logic", kinds: ["condition", "move_stage", "complete", "stop"] },
] as const;
export type SampleInput = {
  stageId?: string;
  jobId?: string;
  name: string;
  email: string;
  source: string;
  appliedPosition: string;
  approved: boolean;
  existingAccount: boolean;
  telegramConfirmed: boolean;
};
export type SampleStep = {
  id: string;
  label: string;
  result: string;
  state: "followed" | "waiting" | "blocked";
  outcome?: string;
  message?: string;
  forms?: string[];
};
// Pure local preview. No database, account, AI, assignment, or delivery modules are imported.
export function previewWorkflow(
  graph: WorkflowGraph,
  sample: SampleInput,
  templates: TemplateOption[],
) {
  const issues = graphIssues(graph),
    steps: SampleStep[] = [],
    visited = new Set<string>(),
    followedEdgeIds: string[] = [];
  let halt = "This sample reaches the end of its path.";
  let node = graph.nodes.find((n) => n.kind === "resume_uploaded"),
    formCount = 0;
  while (node && steps.length < 32 && !visited.has(node.id)) {
    visited.add(node.id);
    const step: SampleStep = {
      id: node.id,
      label: displayNode(node),
      result: "Would continue",
      state: "followed",
    };
    let outcome = "next",
      stop = false;
    const setupProblem = node.kind === "assign_forms" && (!node.config.forms?.length || node.config.forms.some((f) => !f.templateId || !f.roleId))
      ? "Choose a published form before this step can run."
      : node.kind === "condition" && !node.config.value?.trim()
        ? "Enter a condition value before choosing this path."
        : node.kind === "send_telegram" && node.config.message !== undefined && !node.config.message.trim()
          ? "Enter an invitation message before this step can run."
          : null;
    if (setupProblem) {
      step.state = "blocked";
      step.result = setupProblem;
      steps.push(step);
      halt = setupProblem;
      break;
    }
    switch (node.kind) {
      case "resume_uploaded":
        step.result = "Would start with the sample CV";
        break;
      case "extract_resume":
        step.result =
          "Would reuse saved details or request manual review. No AI call.";
        break;
      case "review_resume":
        outcome = sample.approved ? "approved" : "rejected";
        step.result = sample.approved
          ? "Sample HR decision: approved"
          : "Sample HR decision: rejected";
        break;
      case "condition":
        outcome =
          ((sample[node.config.field ?? "source"]??"").trim().toLowerCase() ===
          (node.config.value ?? "").trim().toLowerCase()
          ) !== (node.config.operator === "is_not")
            ? "yes"
            : "no";
        step.result = `Condition would follow ${outcome}`;
        break;
      case "move_stage":
        step.result = "Would request the configured stage move. Live evidence and concurrent changes must be checked during execution.";
        if (sample.stageId !== node.config.fromStageId) {
          step.state = "blocked"; step.result = "Sample application is not in the expected source stage."; stop = true;
        }
        break;
      case "create_account":
        step.result = sample.existingAccount
          ? "Would reuse an account after HR confirms it"
          : "Would create an account after current CV approval";
        break;
      case "link_resume":
        step.result = "Would link the approved CV to the confirmed account";
        break;
      case "assign_forms":
        step.forms = (node.config.forms ?? []).map(
          (f) =>
            templates.find((t) => t.id === f.templateId)?.name ??
            f.name ??
            "Unselected form",
        );
        formCount = step.forms.length;
        step.result = `Would check ${formCount} selected forms for assignment; existing assignments may be kept`;
        break;
      case "send_telegram":
        step.result = sample.telegramConfirmed
          ? "Would attempt invitation delivery; actual delivery is not tested"
          : "Would wait for HR to confirm Telegram contact";
        step.message = (node.config.message ?? DEFAULT_INVITATION)
          .replaceAll("{name}", sample.name)
          .replaceAll("{email}", sample.email)
          .replaceAll("{formCount}", String(formCount));
        stop = !sample.telegramConfirmed;
        if (stop) { step.state = "waiting"; halt = "This sample would wait for Telegram contact confirmation."; }
        break;
      case "stop":
        step.result = "Would end this branch";
        stop = true;
        break;
      case "complete":
        step.result =
          "Would complete this workflow; candidate form submission is separate";
        stop = true;
        break;
    }
    step.outcome = outcome;
    steps.push(step);
    if (stop) break;
    const edge = graph.edges.find(
      (e) => e.source === node!.id && e.outcome === outcome,
    );
    const target = graph.nodes.find((n) => n.id === edge?.target);
    if (!edge || !target || visited.has(target.id)) {
      step.state = "blocked";
      halt = !edge ? `Connect the ${outcome === "next" ? "next step" : outcome + " branch"} to continue this sample.`
        : !target ? "This connection points to a missing step."
          : "This sample stops at a circular connection.";
      step.result = halt;
      break;
    }
    followedEdgeIds.push(edge.id);
    node = target;
  }
  if (!steps.length) halt = "Add a starting event to preview this workflow.";
  return { issues, steps, followedEdgeIds, halt };
}
export function stepEvidence(
  run: WorkflowRun,
  node: WorkflowNode,
  side: "input" | "output",
) {
  if (side === "input")
    return [
      ["CV", run.fileName],
      ["CV reference", run.resumeId],
      ["Published workflow version", String(run.version)],
      ...(run.context.reviewedName
        ? [["Approved candidate", run.context.reviewedName]]
        : []),
      ...(node.kind === "condition"
        ? [["Comparison", `${node.config.field === "stageId" ? "Stage" : node.config.field === "jobId" ? "Job" : node.config.field} ${node.config.operator === "is_not" ? "is not" : "is"} ${node.config.valueLabel || node.config.value}`]]
        : []),
      ...(node.kind === "assign_forms"
        ? [
            [
              "Pinned forms",
              (node.config.forms ?? [])
                .map(
                  (f) =>
                    `${f.name ?? f.templateId} · version ${f.versionId ?? "not recorded"}`,
                )
                .join(", "),
            ],
          ]
        : []),
    ];
  const result = run.context.steps[node.id];
  if (!result) return [["Result", "No result recorded for this step"]];
  return [
    ["Status", result.status],
    ["Attempts", String(result.attempts)],
    ...(result.outcome
      ? [["Branch", result.outcome]]
      : ["condition", "review_resume"].includes(node.kind)
        ? [["Branch", result.status === "completed"
            ? "Not recorded for this older execution"
            : "No branch result recorded yet"]]
        : []),
    ...(result.note ? [["Recorded note", result.note]] : []),
    ...(result.status === "completed" &&
    node.kind === "create_account" &&
    run.context.userId
      ? [["Account reference", run.context.userId]]
      : []),
    ...(result.status === "completed" && node.kind === "link_resume"
      ? [["Linked CV reference", run.resumeId]]
      : []),
    ...(result.status === "completed" && node.kind === "assign_forms"
      ? [
          [
            "Forms",
            (node.config.forms ?? [])
              .map((f) => f.name ?? f.templateId)
              .join(", "),
          ],
        ]
      : []),
    ...(node.kind === "send_telegram"
      ? [
          [
            "Delivery",
            "Use the recorded delivery result below. Sent does not mean read.",
          ],
        ]
      : []),
  ];
}
