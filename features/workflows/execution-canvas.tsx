"use client";
import { useState } from "react";
import Link from "next/link";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import {
  WorkflowCanvas,
  type FlowNode,
  type FlowEdge,
} from "./workflow-canvas";
import { arrangeGraph, DATA_HELP } from "./editor-tools";
import { STEP_LABELS, type WorkflowRun } from "./workflow";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { displayNode, stepEvidence } from "./workspace-tools";
import { runDate } from "./client";
function ExecutionBody({ run }: { run: WorkflowRun }) {
  const flow = useReactFlow<FlowNode, FlowEdge>();
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
      label: n.label,
      note: n.note,
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
      (run.context.steps[e.source]?.outcome === e.outcome ||
        (e.outcome === "next" && !run.context.steps[e.source]?.outcome)) &&
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
      <div className="flex flex-wrap gap-2">
        {run.context.applicationEvent&&<Button variant="outline" size="sm" asChild><Link href={`/hiring/${run.context.applicationEvent.applicationId}`}>Open application</Link></Button>}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelected(run.currentNodeId);
            const current = nodes.find((n) => n.id === run.currentNodeId);
            if (current)
              void flow.setCenter(
                current.position.x + 112,
                current.position.y + 60,
                { zoom: 1, duration: 250 },
              );
          }}
        >
          Focus current step
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void flow.fitView({ padding: 0.25, duration: 250 })}
        >
          Fit execution
        </Button>
      </div>
      <div
        className={
          node
            ? "grid min-w-0 items-start gap-3 2xl:grid-cols-[minmax(0,1fr)_280px]"
            : "min-w-0"
        }
      >
        <div className="h-[48svh] min-h-80 overflow-hidden rounded-lg border bg-muted/20">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            onNodeClick={(_, n) => setSelected(n.id)}
            onNodeDoubleClick={(_, n) =>
              void flow.setCenter(n.position.x + 112, n.position.y + 60, {
                zoom: 1,
                duration: 250,
              })
            }
            onPaneClick={() => setSelected(null)}
          />
        </div>
        {node && (
          <div className="space-y-2 rounded-lg border bg-card p-4">
            <h3 className="font-semibold">{displayNode(node)}</h3>
            <p className="text-xs text-muted-foreground">
              {STEP_LABELS[node.kind]}
            </p>
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
            <Tabs defaultValue="parameters">
              <TabsList>
                <TabsTrigger value="parameters">Parameters</TabsTrigger>
                <TabsTrigger value="input">Input</TabsTrigger>
                <TabsTrigger value="output">Output</TabsTrigger>
              </TabsList>
              <TabsContent value="parameters" className="space-y-2 text-xs">
                <p>{DATA_HELP[node.kind].input}</p>
                <p>{DATA_HELP[node.kind].output}</p>
                {node.note && (
                  <p className="whitespace-pre-wrap rounded border p-2">
                    {node.note}
                  </p>
                )}
                {node.kind === "condition" && (
                  <p>
                    {node.config.field} equals {node.config.value}
                  </p>
                )}
                {node.kind === "assign_forms" && (
                  <ul>
                    {node.config.forms?.map((f) => (
                      <li key={f.templateId + f.roleId}>
                        {f.name ?? f.templateId} · published version{" "}
                        {f.versionId ?? "not recorded"}
                      </li>
                    ))}
                  </ul>
                )}
                {node.kind === "send_telegram" && (
                  <p className="whitespace-pre-wrap">
                    {node.config.message ?? "Default invitation message"}
                  </p>
                )}
              </TabsContent>
              {(["input", "output"] as const).map((side) => (
                <TabsContent key={side} value={side}>
                  <dl className="space-y-2 text-xs">
                    {stepEvidence(run, node, side).map(([label, value]) => (
                      <div key={label}>
                        <dt className="font-medium">{label}</dt>
                        <dd className="whitespace-pre-wrap break-words text-muted-foreground">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </TabsContent>
              ))}
            </Tabs>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/resumes/${run.resumeId}`}>View CV</Link>
              </Button>
              {run.context.candidateId && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/candidates/${run.context.candidateId}`}>
                    View candidate
                  </Link>
                </Button>
              )}
              {run.context.userId && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/accounts">View accounts</Link>
                </Button>
              )}
            </div>
            {run.status === "waiting_review" &&
              node.kind === "review_resume" &&
              node.id === run.currentNodeId && (
                <Button asChild size="sm">
                  <Link href={`/workflows/runs/${run.id}/review`}>
                    Review CV
                  </Link>
                </Button>
              )}
          </div>
        )}
      </div>
    </section>
  );
}

export function ExecutionCanvas({ run }: { run: WorkflowRun }) {
  return (
    <ReactFlowProvider>
      <ExecutionBody key={run.id} run={run} />
    </ReactFlowProvider>
  );
}
