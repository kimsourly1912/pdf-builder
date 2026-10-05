"use client";
import {
  ReactFlow,
  Background,
  Controls,
  ViewportPortal,
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
import type { Guide } from "./canvas-geometry";
import { useTheme } from "next-themes";
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, StickyNote } from "lucide-react";
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
    label?: string;
    note?: string;
    summary?: string;
    onAction?: (
      action: "configure" | "duplicate" | "remove",
      id: string,
    ) => void;
    issues?: string[];
    status?: string;
    preview?: {
      state: "followed" | "waiting" | "blocked" | "skipped";
      label: string;
      reason: string;
    };
    onAdd?: (id: string, outcome: string) => void;
    connectedOutcomes?: string[];
    readOnly?: boolean;
  },
  "step"
>;
export type FlowEdge = Edge<{ onInsert?: (id: string) => void }, "workflow">;
function StepCard({ id, data, selected }: NodeProps<FlowNode>) {
  const Icon = STEP_ICONS[data.kind];
  const color =
    data.preview?.state === "followed"
      ? "border-primary"
      : data.preview?.state === "waiting" || data.preview?.state === "blocked"
        ? "border-amber-500"
        : data.status === "completed"
          ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20"
          : data.status === "failed"
            ? "border-red-500"
            : data.status === "waiting" || data.status === "running"
              ? "border-amber-500"
              : data.issues?.length
                ? "border-amber-400"
                : "border-border";
  const actions = (
    <>
      <ContextMenuItem onSelect={() => data.onAction?.("configure", id)}>
        Configure step
      </ContextMenuItem>
      {data.kind !== "resume_uploaded" && (
        <>
          <ContextMenuItem onSelect={() => data.onAction?.("duplicate", id)}>
            Duplicate step
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => data.onAction?.("remove", id)}>
            Remove step
          </ContextMenuItem>
        </>
      )}
    </>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`relative w-56 rounded-xl border-2 bg-card p-4 shadow-sm ${color} ${data.preview?.state === "skipped" ? "opacity-60" : ""} ${selected ? "ring-2 ring-primary/30 border-primary" : ""}`}
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
              <p className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                {data.label ||
                  (data.kind === "resume_uploaded"
                    ? TRIGGER_LABELS[data.config.trigger ?? "staff_upload"]
                    : STEP_LABELS[data.kind])}
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {data.summary ||
                  (data.kind === "condition"
                    ? `${data.config.field} equals ${data.config.value || "…"}`
                    : data.kind === "assign_forms"
                      ? `${data.config.forms?.length ?? 0} forms selected`
                      : STEP_DESCRIPTIONS[data.kind])}
              </p>
            </div>
          </div>
          {data.note && (
            <p
              className="mt-2 line-clamp-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]"
              title={data.note}
            >
              <StickyNote className="size-3 shrink-0" />
              {data.note}
            </p>
          )}
          {data.onAction && !data.readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`Step actions for ${data.label || STEP_LABELS[data.kind]}`}
                  className="nodrag nopan absolute -right-2 -top-3 rounded-full border bg-card p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onSelect={() => data.onAction?.("configure", id)}
                >
                  Configure step
                </DropdownMenuItem>
                {data.kind !== "resume_uploaded" && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => data.onAction?.("duplicate", id)}
                    >
                      Duplicate step
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => data.onAction?.("remove", id)}
                    >
                      Remove step
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {data.preview && (
            <p title={data.preview.reason} className="mt-2 text-xs font-medium">
              {data.preview.label}
            </p>
          )}
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
              style={{
                top: all.length === 1 ? "50%" : i === 0 ? "30%" : "75%",
              }}
              className={`!size-3 !border-2 ${outcome === "rejected" || outcome === "no" ? "!bg-red-100 !border-red-500" : "!bg-background"}`}
            >
              {all.length > 1 && (
                <span className="pointer-events-none absolute right-3 -top-1 rounded bg-card px-1 text-[10px]">
                  {outcome}
                </span>
              )}
              {data.onAdd &&
                !data.readOnly &&
                !data.connectedOutcomes?.includes(outcome) && (
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
      </ContextMenuTrigger>
      {data.onAction && !data.readOnly && (
        <ContextMenuContent>{actions}</ContextMenuContent>
      )}
    </ContextMenu>
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
export function WorkflowCanvas({
  showMiniMap = true,
  showControls = true,
  guides = [],
  ...props
}: ReactFlowProps<FlowNode, FlowEdge> & {
  showMiniMap?: boolean;
  showControls?: boolean;
  guides?: Guide[];
}) {
  const { resolvedTheme } = useTheme();
  return (
    <ReactFlow
      colorMode={resolvedTheme === "dark" ? "dark" : "light"}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.15}
      maxZoom={2}
      {...props}
    >
      <Background gap={20} size={1} />
      {showControls && <Controls showInteractive={false} />}
      <ViewportPortal>
        {guides.map((guide) => (
          <div
            key={guide.axis}
            aria-hidden="true"
            className="pointer-events-none absolute z-30 bg-pink-500"
            style={
              guide.axis === "x"
                ? {
                    left: guide.coordinate,
                    top: guide.start,
                    width: 1,
                    height: guide.end - guide.start,
                  }
                : {
                    left: guide.start,
                    top: guide.coordinate,
                    height: 1,
                    width: guide.end - guide.start,
                  }
            }
          />
        ))}
      </ViewportPortal>
      {showMiniMap && (
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
      )}
    </ReactFlow>
  );
}
