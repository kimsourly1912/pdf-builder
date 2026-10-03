import { arrangeGraph } from "./editor-tools";
import { defaultGraph, type WorkflowTrigger } from "./workflow";
export const WORKFLOW_PRESETS = {
  approval: {
    name: "Prepare candidate after CV approval",
    trigger: "resume_verified" as WorkflowTrigger,
    description:
      "HR approves the CV in the Resume Editor. Prepare the login account, link that CV, assign your selected forms and send a Telegram invitation. Choose forms before publishing; AI is optional.",
  },
  telegram: {
    name: "Receive Telegram CV for HR review",
    trigger: "telegram_submission" as WorkflowTrigger,
    description:
      "Store the bot submission and wait for HR review. This preset creates no login account and sends no invitation. A separate CV-approval workflow can prepare the candidate after approval.",
  },
  manual: {
    name: "Start preparation manually",
    trigger: "manual" as WorkflowTrigger,
    description:
      "HR explicitly starts preparation for a reviewed CV. Prepare the account, link the CV, assign selected forms and send the invitation. Choose forms before publishing.",
  },
} as const;
export type WorkflowPreset = keyof typeof WORKFLOW_PRESETS;
export function presetGraph(preset: WorkflowPreset) {
  const graph = defaultGraph();
  graph.nodes[0].config.trigger = WORKFLOW_PRESETS[preset].trigger;
  if (preset === "telegram") {
    graph.nodes = graph.nodes.filter((n) =>
      ["upload", "extract", "review", "done", "stop"].includes(n.id),
    );
    graph.edges = graph.edges.filter((e) =>
      ["upload-extract", "extract-review", "review-stop"].includes(e.id),
    );
    graph.edges.push({
      id: "review-done",
      source: "review",
      target: "done",
      outcome: "approved",
    });
  } else {
    graph.nodes.push({
      id: "telegram",
      kind: "send_telegram",
      position: { x: 80, y: 780 },
      config: {},
    });
    graph.edges = graph.edges.filter((e) => e.id !== "assign-done");
    graph.edges.push(
      {
        id: "assign-telegram",
        source: "assign",
        target: "telegram",
        outcome: "next",
      },
      {
        id: "telegram-done",
        source: "telegram",
        target: "done",
        outcome: "next",
      },
    );
  }
  const order = [
    "upload",
    "extract",
    "review",
    "account",
    "link",
    "assign",
    "telegram",
    "done",
    "stop",
  ];
  graph.nodes.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  graph.nodes
    .filter((n) => n.id !== "stop")
    .forEach((n, i) => {
      n.position = { x: 80, y: i * 130 };
    });
  return arrangeGraph(graph);
}
