import { arrangeGraph } from "./editor-tools";
import {
  defaultGraph,
  isApplicationTrigger,
  type WorkflowGraph,
  type WorkflowTrigger,
} from "./workflow";
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
  position_routing: {
    name: "Route frontend applications by position",
    trigger: "application_received" as WorkflowTrigger,
    description:
      'When an application arrives, check whether Applied position is "Frontend Dev". Yes moves it to your chosen stage; No stops. Exact text matching ignores letter case and surrounding spaces. Configure the pipeline and stages in the editor.',
  },
  job_routing: {
    name: "Route applications by job opening",
    trigger: "job_assigned" as WorkflowTrigger,
    description:
      "When a job is assigned, check a selected job opening and move matching applications. Matches the assigned job, so free-text position spelling does not matter. Choose the pipeline, job and stages in the editor.",
  },
  forms_routing: {
    name: "Move applications after forms are accepted",
    trigger: "application_forms_accepted" as WorkflowTrigger,
    description:
      "When HR accepts all required application forms, check the current stage. Yes moves the application forward; No stops. Choose the pipeline and stages in the editor; live stage requirements still apply.",
  },
} as const;
export type WorkflowPreset = keyof typeof WORKFLOW_PRESETS;
export function presetGraph(preset: WorkflowPreset) {
  if (isApplicationTrigger(WORKFLOW_PRESETS[preset].trigger)) {
    const position = preset === "position_routing";
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "upload",
          kind: "resume_uploaded",
          position: { x: 0, y: 0 },
          config: { trigger: WORKFLOW_PRESETS[preset].trigger },
          note: "Choose a published hiring pipeline before publishing this routing workflow.",
        },
        {
          id: "condition",
          kind: "condition",
          position: { x: 0, y: 0 },
          config: {
            field: position ? "appliedPosition" : preset === "job_routing" ? "jobId" : "stageId",
            operator: "is",
            value: position ? "Frontend Dev" : "",
          },
          note: position
            ? 'Try " frontend dev " and "Frontend Developer" in Test with sample to compare the Yes and No paths. This is an exact text check, without synonyms or fuzzy matching.'
            : "Choose the job opening or current stage to match. Yes moves the application; No ends without moving it.",
        },
        {
          id: "move",
          kind: "move_stage",
          position: { x: 0, y: 0 },
          config: {},
          note: "Choose the expected current stage and a different destination. A live move checks stage requirements and concurrent changes; it never approves a CV or sends an invitation.",
        },
        { id: "done", kind: "complete", position: { x: 0, y: 0 }, config: {} },
        { id: "stop", kind: "stop", position: { x: 0, y: 0 }, config: {} },
      ],
      edges: [
        { id: "start-condition", source: "upload", target: "condition", outcome: "next" },
        { id: "condition-move", source: "condition", target: "move", outcome: "yes" },
        { id: "condition-stop", source: "condition", target: "stop", outcome: "no" },
        { id: "move-done", source: "move", target: "done", outcome: "next" },
      ],
    };
    return arrangeGraph(graph);
  }
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
