"use client";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type NodeProps,
  type Edge,
  type EdgeProps,
  type ReactFlowProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Send,
  FileUp,
  Sparkles,
  UserCheck,
  UserPlus,
  Link2,
  Files,
  GitBranch,
  CheckCircle2,
  CircleStop,
  Plus,
} from "lucide-react";
import {
  STEP_LABELS,
  STEP_DESCRIPTIONS,
  TRIGGER_LABELS,
  type StepKind,
  type StepConfig,
} from "./workflow";
import { outcomes } from "./editor-tools";
export const STEP_ICONS = {
  resume_uploaded: FileUp,
  extract_resume: Sparkles,
  review_resume: UserCheck,
  create_account: UserPlus,
  link_resume: Link2,
  assign_forms: Files,
  send_telegram: Send,
  condition: GitBranch,
  complete: CheckCircle2,
  stop: CircleStop,
};
export type FlowNode = Node<
  {
    kind: StepKind;
    config: StepConfig;
    issues?: string[];
    status?: string;
    onAdd?: (id: string, outcome: string) => void;
    readOnly?: boolean;
  },
  "step"
>;
export type FlowEdge = Edge<{ onInsert?: (id: string) => void }, "workflow">;
function StepCard({ id, data, selected }: NodeProps<FlowNode>) {
  const Icon = STEP_ICONS[data.kind];
  const color =
    data.status === "completed"
      ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20"
      : data.status === "failed"
        ? "border-red-500"
        : data.status === "waiting" || data.status === "running"
          ? "border-amber-500"
          : data.issues?.length
            ? "border-amber-400"
            : "border-border";
  return (
    <div
      className={`relative w-56 rounded-xl border-2 bg-card p-4 shadow-sm ${color} ${selected ? "ring-2 ring-primary/30 border-primary" : ""}`}
    >
      {data.kind !== "resume_uploaded" && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          title="Input — connect a preceding step"
          className="!size-3 !border-2 !bg-background"
        />
      )}
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {data.kind === "resume_uploaded"
              ? TRIGGER_LABELS[data.config.trigger ?? "staff_upload"]
              : STEP_LABELS[data.kind]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.kind === "assign_forms"
              ? `${data.config.forms?.length ?? 0} forms selected`
              : STEP_DESCRIPTIONS[data.kind]}
          </p>
        </div>
      </div>
      {data.status && (
        <p className="mt-2 text-xs font-medium">
          {data.status === "not_reached"
            ? "Not reached"
            : data.status === "waiting"
              ? "Waiting for action"
              : data.status[0].toUpperCase() + data.status.slice(1)}
        </p>
      )}
      {!data.status && data.issues?.length ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Needs setup · {data.issues.length}{" "}
          {data.issues.length === 1 ? "issue" : "issues"}
        </p>
      ) : null}
      {outcomes(data.kind).map((outcome, i, all) => (
        <Handle
          key={outcome}
          type="source"
          position={Position.Right}
          id={outcome}
          title={`Output: ${outcome}`}
          style={{ top: all.length === 1 ? "50%" : i === 0 ? "30%" : "75%" }}
          className={`!size-3 !border-2 ${outcome === "rejected" || outcome === "no" ? "!bg-red-100 !border-red-500" : "!bg-background"}`}
        >
          {all.length > 1 && (
            <span className="pointer-events-none absolute right-3 -top-1 rounded bg-card px-1 text-[10px]">
              {outcome}
            </span>
          )}
          {data.onAdd && !data.readOnly && (
            <button
              type="button"
              className="nodrag nopan absolute -top-2 left-4 flex size-6 items-center justify-center rounded-full border bg-card text-primary shadow-sm hover:bg-primary/10"
              aria-label={`Add step after ${STEP_LABELS[data.kind]} ${outcome}`}
              onClick={(e) => {
                e.stopPropagation();
                data.onAdd?.(id, outcome);
              }}
            >
              <Plus className="size-3" />
            </button>
          )}
        </Handle>
      ))}
    </div>
  );
}
function WorkflowEdgeView(props: EdgeProps<FlowEdge>) {
  const [path, x, y] = getSmoothStepPath(props);
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={props.style}
        markerEnd={props.markerEnd}
        interactionWidth={24}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute flex items-center gap-1 rounded bg-background/90 px-1 text-xs"
          style={{
            transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
            pointerEvents: "all",
          }}
        >
          {props.label && <span>{String(props.label)}</span>}
          {props.data?.onInsert && (
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded-full border bg-card text-primary hover:bg-primary/10"
              aria-label="Insert step on connection"
              onClick={() => props.data?.onInsert?.(props.id)}
            >
              <Plus className="size-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const nodeTypes = { step: StepCard },
  edgeTypes = { workflow: WorkflowEdgeView };
export function WorkflowCanvas(props: ReactFlowProps<FlowNode, FlowEdge>) {
  return (
    <ReactFlow
      {...props}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.15}
      maxZoom={2}
      snapToGrid
      snapGrid={[20, 20]}
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) =>
          n.data.status === "failed"
            ? "#ef4444"
            : n.data.status === "completed"
              ? "#10b981"
              : "#64748b"
        }
        className="!hidden sm:!block"
      />
    </ReactFlow>
  );
}
