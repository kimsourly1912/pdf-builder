"use client";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowCanvas, type FlowNode, type FlowEdge } from "./workflow-canvas";
import { arrangeGraph } from "./editor-tools";
import type { WorkflowGraph } from "./workflow";
import type { previewWorkflow } from "./workspace-tools";

export type SampleResult = ReturnType<typeof previewWorkflow>;
export function sampleNodeState(result: SampleResult, id: string) {
  const step = result.steps.find((s) => s.id === id);
  return step ? {
    state: step.state,
    label: `${result.steps.indexOf(step) + 1}. ${step.state === "waiting" ? "Would wait" : step.state === "blocked" ? "Needs setup" : "On sample path"}`,
    reason: step.result,
  } : { state: "skipped" as const, label: "Not on sample path", reason: "This sample does not reach this step." };
}
export function sampleEdgeStyle(result: SampleResult, id: string) {
  return result.followedEdgeIds.includes(id)
    ? { stroke: "var(--primary)", strokeWidth: 3 }
    : { stroke: "var(--muted-foreground)", strokeWidth: 1.5, strokeDasharray: "5 5", opacity: 0.35 };
}
export function SampleCanvas({ graph, result, onFocus }: {
  graph: WorkflowGraph;
  result: SampleResult;
  onFocus?: (id: string) => void;
}) {
  const arranged = arrangeGraph(graph);
  const nodes: FlowNode[] = arranged.nodes.map((n) => ({
    id: n.id, type: "step", position: n.position,
    data: { kind: n.kind, config: n.config, label: n.label, readOnly: true, preview: sampleNodeState(result, n.id) },
  }));
  const edges: FlowEdge[] = arranged.edges.map((e) => ({
    id: e.id, type: "workflow", source: e.source, target: e.target,
    sourceHandle: e.outcome, targetHandle: "in",
    label: e.outcome === "next" ? undefined : e.outcome,
    style: sampleEdgeStyle(result, e.id),
  }));
  return <section aria-label="Sample path canvas" className="space-y-2">
    <p className="text-xs text-muted-foreground">Solid lines follow this sample. Dashed lines are not followed. These are simulated steps, not execution results. Scroll or use + to zoom.</p>
    <div className="h-[42svh] min-h-72 overflow-hidden rounded-lg border">
      <ReactFlowProvider>
        <WorkflowCanvas showMiniMap={false} nodes={nodes} edges={edges} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} onNodeClick={(_, n) => onFocus?.(n.id)} />
      </ReactFlowProvider>
    </div>
    <p role="status" className="text-sm">{result.halt}</p>
  </section>;
}
