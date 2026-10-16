import {
  TRIGGER_LABELS,
  workflowTrigger,
  type WorkflowGraph,
} from "./workflow";
export function workflowBusinessSummary(graph: WorkflowGraph) {
  const kinds = new Set(graph.nodes.map((n) => n.kind));
  const actions = [
    kinds.has("extract_resume") ? "Reuse saved CV data (no paid AI)" : null,
    kinds.has("review_resume") ? "Wait for HR CV approval" : null,
    kinds.has("create_account") ? "Prepare candidate account" : null,
    kinds.has("link_resume") ? "Link the approved CV" : null,
    kinds.has("assign_forms") ? "Assign selected forms" : null,
    kinds.has("send_telegram") ? "Send Telegram invitation" : null,
    kinds.has("prepare_application") ? "Start application preparation with HR review" : null,
    kinds.has("move_stage") ? "Move application after checking stage requirements" : null,
  ].filter((action): action is string => !!action);
  return {
    when: TRIGGER_LABELS[workflowTrigger(graph)],
    actions,
    conditional: kinds.has("condition") || kinds.has("review_resume"),
  };
}
