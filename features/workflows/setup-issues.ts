import { outcomes } from "./editor-tools";
import type { WorkflowGraph, WorkflowNode } from "./workflow";

export type SetupIssue = {
  message: string;
  action: string;
  control: string;
};
// Navigation diagnostics complement graphIssues; publication still uses the full validator.
export function stepSetupIssues(graph: WorkflowGraph, node: WorkflowNode): SetupIssue[] {
  const issues: SetupIssue[] = [];
  for (const outcome of outcomes(node.kind)) {
    const edges = graph.edges.filter((e) => e.source === node.id && e.outcome === outcome);
    if (edges.length !== 1 || !graph.nodes.some((n) => n.id === edges[0]?.target)) {
      const rejected = node.kind === "review_resume" && outcome === "rejected";
      const missingStop = rejected && !graph.nodes.some((n) => n.kind === "stop");
      issues.push({
        message: rejected ? "Connect the rejected path directly to Stop." : `Connect ${outcome === "next" ? "the next step" : `the ${outcome} path`}.`,
        action: missingStop ? "Add Stop" : rejected ? "Connect to Stop" : "Choose next step",
        control: missingStop ? "step-add-rejected" : `connection-${outcome}`,
      });
    }
  }
  if (node.kind === "review_resume") {
    const rejected = graph.edges.find((e) => e.source === node.id && e.outcome === "rejected");
    const target = graph.nodes.find((n) => n.id === rejected?.target);
    if (rejected && target && target.kind !== "stop" && !issues.some((i) => i.control === "connection-rejected")) {
      issues.push({ message: "Connect the rejected path directly to Stop.", action: "Fix rejected path", control: "connection-rejected" });
    }
  }
  if (node.kind !== "resume_uploaded" && !graph.edges.some((e) => e.target === node.id)) {
    issues.push({message: "Connect this step to a previous step.", action: "Choose previous step", control: "connection-incoming"});
  }
  if (node.kind === "assign_forms") {
    const forms = node.config.forms ?? [];
    if (!forms.length) issues.push({ message: "Choose at least one published form.", action: "Add a form", control: "step-add-form" });
    else {
      const invalid = forms.findIndex((f) => !f.templateId || !f.roleId);
      if (invalid >= 0) issues.push({ message: "Choose a published form for every assignment.", action: "Choose a form", control: forms[invalid].templateId && !forms[invalid].roleId ? `step-role-${invalid + 1}` : `step-form-${invalid + 1}` });
      if (new Set(forms.map((f) => `${f.templateId}:${f.roleId}`)).size !== forms.length) {
        issues.push({ message: "Remove repeated form selections.", action: "Review selected forms", control: "step-form-1" });
      }
    }
  }
  if (node.kind === "condition" && !node.config.value?.trim()) {
    issues.push({ message: "Enter a value for this condition.", action: "Enter comparison value", control: "condition-value" });
  }
  if (node.kind === "send_telegram" && node.config.message !== undefined && !node.config.message.trim()) {
    issues.push({ message: "Write the Telegram invitation message.", action: "Edit message", control: "telegram-message" });
  }
  return issues;
}
export function incomingChoices(graph: WorkflowGraph, nodeId: string) {
  // Only free outputs are offered. Choosing one never replaces an existing connection.
  return graph.nodes.filter((n) => n.id !== nodeId).flatMap((n) =>
    outcomes(n.kind).filter((outcome) => !graph.edges.some((e) => e.source === n.id && e.outcome === outcome))
      .map((outcome) => ({ source: n.id, outcome })),
  );
}
