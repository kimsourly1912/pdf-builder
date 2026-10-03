"use client";
import { useState } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import {
  WorkflowCanvas,
  type FlowNode,
  type FlowEdge,
} from "./workflow-canvas";
import { arrangeGraph, DATA_HELP } from "./editor-tools";
import { STEP_LABELS, type WorkflowRun } from "./workflow";
import { Button } from "@/components/ui/button";
import { runDate } from "./client";
export function ExecutionCanvas({ run }: { run: WorkflowRun }) {
  const [selected, setSelected] = useState<string | null>(null);
  const graph = arrangeGraph(run.graph);
  const nodes: FlowNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "step",
    position: n.position,
    selected: selected === n.id,
    data: {
      kind: n.kind,
      config: n.config,
      readOnly: true,
      status:
        run.context.steps[n.id]?.status ??
        (run.currentNodeId === n.id
          ? run.status === "waiting_review"
            ? "waiting"
            : run.status === "failed"
              ? "failed"
              : run.status === "running"
                ? "running"
                : "queued"
          : "not_reached"),
    },
  }));
  const edges: FlowEdge[] = graph.edges.map((e) => {
    const followed =
      e.outcome === "next" &&
      run.context.steps[e.source]?.status === "completed" &&
      Boolean(run.context.steps[e.target]);
    return {
      id: e.id,
      type: "workflow",
      source: e.source,
      target: e.target,
      sourceHandle: e.outcome,
      targetHandle: "in",
      label: e.outcome === "next" ? undefined : e.outcome,
      style: {
        stroke: followed ? "#10b981" : "#94a3b8",
        strokeWidth: followed ? 3 : 1.5,
      },
    };
  });
  const node = graph.nodes.find((n) => n.id === selected),
    result = node ? run.context.steps[node.id] : undefined;
  return (
    <section className="space-y-3" aria-label="Execution graph">
      <p className="text-xs text-muted-foreground">
        Read-only published version {run.version}. Click a step to inspect its
        recorded result. A completed workflow does not mean candidate forms were
        submitted.
      </p>
      <div className="h-[48svh] min-h-80 overflow-hidden rounded-lg border bg-muted/20">
        <ReactFlowProvider>
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            onNodeClick={(_, n) => setSelected(n.id)}
            onPaneClick={() => setSelected(null)}
          />
        </ReactFlowProvider>
      </div>
      {node && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">{STEP_LABELS[node.kind]}</h3>
          <p className="text-sm">
            {result?.note ??
              (node.id === run.currentNodeId
                ? `Current step · ${run.context.waitingFor ? `Waiting for ${run.context.waitingFor === "telegram_retry" ? "delivery review" : "Telegram contact confirmation"}` : run.status.replaceAll("_", " ")}`
                : "Not reached on this execution")}
          </p>
          {result && (
            <p className="text-xs text-muted-foreground">
              {result.attempts} attempts
              {result.completedAt ? ` · ${runDate(result.completedAt)}` : ""}
            </p>
          )}
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <p>
              <strong>Input:</strong> {DATA_HELP[node.kind].input}
            </p>
            <p>
              <strong>Output:</strong> {DATA_HELP[node.kind].output}
            </p>
          </div>
          {run.status === "waiting_review" &&
            node.kind === "review_resume" &&
            node.id === run.currentNodeId && (
              <Button asChild size="sm">
                <Link href={`/workflows/runs/${run.id}/review`}>Review CV</Link>
              </Button>
            )}
        </div>
      )}
    </section>
  );
}
