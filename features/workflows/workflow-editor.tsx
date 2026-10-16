"use client";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import {
  stepSetupIssues,
  incomingChoices,
  type SetupIssue,
} from "./setup-issues";
import {
  sampleNodeState,
  sampleEdgeStyle,
  type SampleResult,
} from "./sample-canvas";
import type { SampleInput } from "./workspace-tools";
import { WorkflowOutline } from "./workflow-outline";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { BusinessSummaryCard } from "./business-summary-card";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useNodesInitialized,
  useViewport,
  applyNodeChanges,
  SelectionMode,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import {
  Plus,
  Save,
  Play,
  Pause,
  LoaderCircle,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  X,
  LayoutGrid,
  MousePointer2,
  Hand,
  Minus,
  AlignHorizontalJustifyCenter,
  ListOrdered,
  MoreHorizontal,
  Info,
  CheckCircle2,
} from "lucide-react";
import { ThemeToggle } from "@/components/patterns/theme-toggle";
import {
  alignSelection,
  distributeSelection,
  snapSelection,
  parseViewport,
  type CanvasBox,
  type Guide,
  type Alignment,
} from "./canvas-geometry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useUnsavedChanges } from "@/features/resumes/use-unsaved-changes";
import { WorkflowReadiness } from "./workflow-readiness";
import { PublishHistory } from "./publish-history";
import { WorkflowRunsView } from "./workflow-runs";
import {
  WorkflowCanvas,
  type FlowNode,
  type FlowEdge,
} from "./workflow-canvas";
import { StepCatalog } from "./step-catalog";
import { SampleTest } from "./sample-test";
import { DATA_HELP } from "./editor-tools";
import { displayNode, graphIdentity, graphChanges } from "./workspace-tools";
import { StepSettings } from "./step-settings";
import { workflowApi, errorText } from "./client";
import {
  TRIGGER_LABELS,
  STEP_KINDS,
  workflowTrigger,
  isApplicationTrigger,
  graphIssues,
  parseGraph,
  parseDraftGraph,
  type StepKind,
  type WorkflowGraph,
  type WorkflowDetail,
  type WorkflowSummary,
  type TemplateOption,
  type WorkflowEdge,
} from "./workflow";
import {
  newStep,
  insertStep,
  connectionIssue,
  removeSteps,
  arrangeGraph,
  nodeIssues,
  outcomes,
} from "./editor-tools";
function flowNodes(graph: WorkflowGraph): FlowNode[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: "step",
    position: n.position,
    data: { kind: n.kind, config: n.config, label: n.label, note: n.note },
  }));
}
function flowEdges(graph: WorkflowGraph): FlowEdge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.outcome,
    targetHandle: "in",
    type: "workflow",
    label: e.outcome === "next" ? undefined : e.outcome,
    style: {
      stroke:
        e.outcome === "rejected" || e.outcome === "no" ? "#dc2626" : "#64748b",
      strokeWidth: 2,
    },
  }));
}
export function WorkflowEditor(props: {
  displayName: string;
  workflowId: string;
  preferenceKey: string;
}) {
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null),
    [options, setOptions] = useState<TemplateOption[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      workflowApi<{ workflow: WorkflowDetail }>(
        `/api/workflows/${props.workflowId}`,
        { signal: controller.signal },
      ),
      workflowApi<{ templates: TemplateOption[] }>("/api/workflows", {
        signal: controller.signal,
      }),
    ])
      .then(([w, t]) => {
        if (controller.signal.aborted) return;
        setWorkflow(w.workflow);
        setOptions(t.templates);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [props.workflowId]);
  return (
    <div className="h-svh min-w-0 bg-background">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {workflow ? (
        <ReactFlowProvider>
          <EditorBody
            key={workflow.id}
            initial={workflow}
            options={options}
            preferenceKey={props.preferenceKey}
          />
        </ReactFlowProvider>
      ) : (
        <p className="py-20 text-center text-muted-foreground">
          {error ? "Workflow unavailable." : "Loading workflow…"}
        </p>
      )}
    </div>
  );
}
function EditorBody({
  initial,
  options,
  preferenceKey,
}: {
  initial: WorkflowDetail;
  options: TemplateOption[];
  preferenceKey: string;
}) {
  const [workflow, setWorkflow] = useState(initial),
    [name, setName] = useState(initial.name);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
    flowNodes(initial.draft),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(
    flowEdges(initial.draft),
  );
  const [tool, setTool] = useState<"select" | "hand">("select"),
    [sampleOpen, setSampleOpen] = useState(false),
    [outlineOpen, setOutlineOpen] = useState(false),
    [overviewOpen, setOverviewOpen] = useState(false),
    [inspectorTab, setInspectorTab] = useState("parameters");
  const [preview, setPreview] = useState<{
    signature: string;
    result: SampleResult;
    sample: SampleInput;
  } | null>(null);
  const [settingTarget, setSettingTarget] = useState<{
    nodeId: string | null;
    control: string;
  } | null>(null);
  const [recovery, setRecovery] = useState<WorkflowDetail | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(media.matches);
    queueMicrotask(update);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [reconnecting, setReconnecting] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [saveState, setSaveState] = useState("Saved"),
    [startOpen, setStartOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [addContext, setAddContext] = useState<{
    source?: string;
    outcome?: WorkflowEdge["outcome"];
    position?: { x: number; y: number };
    anchor?: { x: number; y: number };
  }>({});
  const [publishOpen, setPublishOpen] = useState(false),
    [validateOpen, setValidateOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const [overlapCheck, setOverlapCheck] = useState("checking"),
    [overlapAttempt, setOverlapAttempt] = useState(0);
  const [siblings, setSiblings] = useState<WorkflowSummary[]>([]);
  useEffect(() => {
    if (!publishOpen) return;
    const controller = new AbortController();
    void workflowApi<{ items: WorkflowSummary[] }>("/api/workflows", {
      signal: controller.signal,
    })
      .then((d) => {
        if (!controller.signal.aborted) {
          setSiblings(d.items);
          setOverlapCheck("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOverlapCheck("failed");
      });
    return () => controller.abort();
  }, [publishOpen, overlapAttempt]);
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "runs"
      ? "runs"
      : "editor",
  );
  const [past, setPast] = useState<WorkflowGraph[]>([]),
    [future, setFuture] = useState<WorkflowGraph[]>([]);
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const nodesInitialized = useNodesInitialized();
  const viewport = useViewport();
  const viewportReady = useRef(false);
  const canvasElement = useRef<HTMLDivElement>(null);
  const viewportKey = `workflow-viewport:${preferenceKey}:${initial.id}`;
  const [guides, setGuides] = useState<Guide[]>([]);
  const dragStart = useRef<WorkflowGraph | null>(null);
  const altPressed = useRef(false);
  const selection = nodes.filter((node) => node.selected);
  const boxes = (list: FlowNode[]): CanvasBox[] =>
    list.map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? 224,
      height: node.measured?.height ?? 110,
    }));
  useEffect(() => {
    if (!nodesInitialized || viewportReady.current || tab !== "editor") return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      let stored: ReturnType<typeof parseViewport> = null;
      try {
        stored = parseViewport(localStorage.getItem(viewportKey));
      } catch {
        /* Device storage may be unavailable. */
      }
      void (
        stored
          ? flow.setViewport(stored)
          : flow.fitView({ padding: 0.18, maxZoom: 1 })
      ).then(() => {
        if (!cancelled) viewportReady.current = true;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [nodesInitialized, tab, flow, viewportKey]);
  const changeNodes = (changes: NodeChange<FlowNode>[]) => {
    const moving = changes.flatMap((change) =>
      change.type === "position" && change.dragging && change.position
        ? [change.id]
        : [],
    );
    if (!moving.length || !editable || altPressed.current) {
      if (moving.length) setGuides([]);
      onNodesChange(changes);
      return;
    }
    const proposed = applyNodeChanges(changes, nodes);
    const snapped = snapSelection(
      boxes(proposed.filter((node) => moving.includes(node.id))),
      boxes(proposed.filter((node) => !moving.includes(node.id))),
      6 / flow.getZoom(),
    );
    setGuides(snapped.guides);
    setNodes(
      applyNodeChanges(
        changes.map((change) =>
          change.type === "position" &&
          change.position &&
          moving.includes(change.id)
            ? {
                ...change,
                position: {
                  x: change.position.x + snapped.dx,
                  y: change.position.y + snapped.dy,
                },
              }
            : change,
        ),
        nodes,
      ),
    );
  };
  const graph: WorkflowGraph = {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      position: n.position,
      config: n.data.config,
      ...(n.data.label ? { label: n.data.label } : {}),
      ...(n.data.note ? { note: n.data.note } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      outcome: (e.sourceHandle ?? "next") as WorkflowEdge["outcome"],
    })),
  };
  const activePreview =
    preview?.signature === graphIdentity(graph) ? preview.result : null;
  useEffect(() => {
    if (
      !settingTarget ||
      (settingTarget.nodeId &&
        (selected !== settingTarget.nodeId || inspectorTab !== "parameters"))
    )
      return;
    const timer = setTimeout(() => {
      const control = document.getElementById(settingTarget.control);
      if (control) {
        let parent = control.parentElement;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        control.scrollIntoView({ block: "nearest" });
        control.focus();
      }
      setSettingTarget(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [settingTarget, selected, inspectorTab]);
  const fingerprint = JSON.stringify([name, parseDraftGraph(graph) ?? graph]);
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    JSON.stringify([
      initial.name,
      parseDraftGraph(initial.draft) ?? initial.draft,
    ]),
  );
  const dirty = fingerprint !== savedFingerprint;
  const current = useRef({ name, graph, fingerprint }),
    revision = useRef(initial.updatedAt),
    saving = useRef<Promise<void> | null>(null),
    saved = useRef(savedFingerprint);
  useEffect(() => {
    current.current = { name, graph, fingerprint };
  });
  useUnsavedChanges(dirty);
  const editable = !workflow.archived && !busy;
  const parsed = parseGraph(graph),
    issues = graphIssues(graph);
  if (!parsed)
    issues.push(
      "Complete the step settings, including a non-empty Telegram message.",
    );
  if (!name.trim() || name.length > 120)
    issues.push("Enter a workflow name within 120 characters.");
  const save = useCallback(
    async (action: "save" | "publish" | "pause") => {
      if (action !== "save") setBusy(true);
      try {
        while (saving.current) await saving.current;
        const snapshot = current.current;
        if (action === "save" && snapshot.fingerprint === saved.current) return;
        setSaveState(action === "save" ? "Saving…" : "Publishing…");
        setError("");
        const operation = (async () => {
          const payload = await workflowApi<{ workflow: WorkflowDetail }>(
            `/api/workflows/${initial.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                action,
                expectedUpdatedAt: revision.current,
                name: snapshot.name,
                graph: snapshot.graph,
              }),
            },
          );
          revision.current = payload.workflow.updatedAt;
          setWorkflow(payload.workflow);
          if (action !== "pause") {
            saved.current = snapshot.fingerprint;
            setSavedFingerprint(snapshot.fingerprint);
          }
          setSaveState("Saved");
          if (action !== "save")
            setNotice(
              action === "publish"
                ? `Version ${payload.workflow.version} published. Starts when: ${TRIGGER_LABELS[workflowTrigger(snapshot.graph)]}. Existing runs keep their published version.`
                : "Paused for new automatic runs. Existing runs continue.",
            );
        })();
        saving.current = operation;
        await operation;
      } catch (e) {
        setSaveState("Save failed — retry Save draft");
        setError(errorText(e));
        throw e;
      } finally {
        saving.current = null;
        if (action !== "save") setBusy(false);
      }
    },
    [initial.id, setSavedFingerprint],
  );
  const canSaveDraft = Boolean(parseDraftGraph(graph));
  useEffect(() => {
    if (
      !dirty ||
      !editable ||
      !canSaveDraft ||
      !name.trim() ||
      name.length > 120
    )
      return;
    const timer = setTimeout(() => void save("save").catch(() => {}), 1600);
    return () => clearTimeout(timer);
  }, [fingerprint, dirty, editable, canSaveDraft, name, save]);
  const commit = (next: WorkflowGraph) => {
    if (!editable || JSON.stringify(next) === JSON.stringify(graph)) return;
    setPast((p) => [...p, graph].slice(-50));
    setFuture([]);
    setNodes(
      flowNodes(next).map((node) => ({
        ...node,
        selected: nodes.some(
          (previous) => previous.id === node.id && previous.selected,
        ),
      })),
    );
    setEdges(flowEdges(next));
    setNotice("");
    setError("");
  };
  const restore = (next: WorkflowGraph) => {
    setNodes(flowNodes(next));
    setEdges(flowEdges(next));
    setSelected(null);
  };
  const undo = () => {
    if (!editable || !past.length) return;
    setFuture((f) => [graph, ...f]);
    setPast((p) => p.slice(0, -1));
    restore(past.at(-1)!);
  };
  const redo = () => {
    if (!editable || !future.length) return;
    setPast((p) => [...p, graph]);
    setFuture((f) => f.slice(1));
    restore(future[0]);
  };
  const openPalette = (source?: string, outcome?: string) => {
    setSelected(null);
    if (!editable) return;
    const parent = graph.nodes.find((node) => node.id === source);
    const rect = canvasElement.current?.getBoundingClientRect();
    const point = parent
      ? flow.flowToScreenPosition({
          x: parent.position.x + 250,
          y: parent.position.y + 50,
        })
      : null;
    const anchor =
      rect && point
        ? {
            x: Math.max(12, Math.min(point.x - rect.x, rect.width - 300)),
            y: Math.max(
              12,
              Math.min(point.y - rect.y, Math.max(12, rect.height - 380)),
            ),
          }
        : undefined;
    setAddContext({
      source,
      outcome: outcome as WorkflowEdge["outcome"],
      anchor,
    });
    setNodes((previous) =>
      previous.map((node) => ({ ...node, selected: false })),
    );
    setPaletteOpen(true);
  };
  const add = (kind: StepKind, position?: { x: number; y: number }) => {
    if (!editable) return;
    try {
      const parent = graph.nodes.find((n) => n.id === addContext.source);
      const node = newStep(
        kind,
        position ??
          (parent
            ? { x: parent.position.x + 340, y: parent.position.y }
            : flow.screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              })),
      );
      let next = insertStep(graph, node, addContext.source, addContext.outcome);
      if (!position && addContext.source) next = arrangeGraph(next);
      commit(next);
      setSelected(node.id);
      setNodes((previous) =>
        previous.map((item) => ({ ...item, selected: item.id === node.id })),
      );
      setPaletteOpen(false);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const connect = (connection: Connection, existing?: FlowEdge) => {
    if (!editable || !connection.source || !connection.target) return;
    const outcome = (connection.sourceHandle ??
      "next") as WorkflowEdge["outcome"];
    const problem = connectionIssue(
      graph,
      connection.source,
      connection.target,
      outcome,
      existing?.id,
    );
    if (problem) {
      setError(problem);
      return;
    }
    commit({
      ...graph,
      edges: [
        ...graph.edges.filter((e) => e.id !== existing?.id),
        {
          id: existing?.id ?? crypto.randomUUID(),
          source: connection.source,
          target: connection.target,
          outcome,
        },
      ],
    });
  };
  const duplicate = (onlyId?: string) => {
    const originals = nodes.filter((n) =>
      onlyId ? n.id === onlyId : n.selected,
    );
    const selectedNodes = originals.length
      ? originals
      : nodes.filter((n) => n.id === selected);
    const copyable = selectedNodes.filter(
      (n) => n.data.kind !== "resume_uploaded",
    );
    if (!copyable.length) return;
    if (nodes.length + copyable.length > 32) {
      setError("A workflow can contain up to 32 steps.");
      return;
    }
    const ids = new Map(copyable.map((n) => [n.id, crypto.randomUUID()]));
    commit({
      ...graph,
      nodes: [
        ...graph.nodes,
        ...copyable.map((n) => ({
          id: ids.get(n.id)!,
          kind: n.data.kind,
          config: structuredClone(n.data.config),
          label: n.data.label,
          note: n.data.note,
          position: { x: n.position.x + 60, y: n.position.y + 180 },
        })),
      ],
      edges: [
        ...graph.edges,
        ...graph.edges
          .filter((e) => ids.has(e.source) && ids.has(e.target))
          .map((e) => ({
            ...e,
            id: crypto.randomUUID(),
            source: ids.get(e.source)!,
            target: ids.get(e.target)!,
          })),
      ],
    });
    setSelected(ids.get(copyable[0].id)!);
  };
  const remove = () => {
    const ids = nodes.filter((n) => n.selected).map((n) => n.id);
    const edgeIds = edges.filter((e) => e.selected).map((e) => e.id);
    commit(
      removeSteps(
        graph,
        ids.length ? ids : selected ? [selected] : [],
        edgeIds,
      ),
    );
    setSelected(null);
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      altPressed.current = event.altKey;
      if (
        tab === "editor" &&
        event.key === "Escape" &&
        paletteOpen &&
        !(
          event.target instanceof Element &&
          event.target.closest("[role=dialog],[role=alertdialog]")
        )
      ) {
        event.preventDefault();
        setPaletteOpen(false);
        canvasElement.current?.focus();
        return;
      }
      if (
        tab !== "editor" ||
        !editable ||
        event.defaultPrevented ||
        (event.target instanceof Element &&
          event.target.closest(
            "input,textarea,select,[contenteditable=true],[role=combobox],[role=dialog],[role=alertdialog]",
          ))
      )
        return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.ctrlKey && !event.metaKey && key === "y") {
        event.preventDefault();
        redo();
      } else if ((event.ctrlKey || event.metaKey) && key === "d") {
        event.preventDefault();
        duplicate();
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        remove();
      } else if (key === "escape") {
        setPaletteOpen(false);
        setSelected(null);
        setNodes((previous) =>
          previous.map((node) => ({ ...node, selected: false })),
        );
      } else if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        key === "v"
      )
        setTool("select");
      else if (!event.ctrlKey && !event.metaKey && !event.altKey && key === "h")
        setTool("hand");
    };
    const keyup = (event: KeyboardEvent) => {
      altPressed.current = event.altKey;
    };
    const blur = () => {
      altPressed.current = false;
      setGuides([]);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", blur);
    };
  });
  const align = (alignment: Alignment) =>
    commit(alignSelection(graph, boxes(selection), alignment));
  const distribute = (axis: "x" | "y") =>
    commit(distributeSelection(graph, boxes(selection), axis));
  const finishDrag = () => {
    setGuides([]);
    const before = dragStart.current;
    if (
      before &&
      JSON.stringify(before.nodes.map((node) => node.position)) !==
        JSON.stringify(graph.nodes.map((node) => node.position))
    ) {
      setPast((previous) => [...previous, before].slice(-50));
      setFuture([]);
    }
    dragStart.current = null;
  };
  const selectedNode =
    selection.length > 1
      ? undefined
      : graph.nodes.find((n) => n.id === selected);
  const select = (id: string) => {
    setPaletteOpen(false);
    setSelected(id);
    setInspectorTab("parameters");
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
  };
  const focus = (id: string) => {
    select(id);
    const n = nodes.find((n) => n.id === id);
    if (n)
      void flow.setCenter(n.position.x + 112, n.position.y + 60, {
        zoom: 1,
        duration: 300,
      });
    setValidateOpen(false);
    setSampleOpen(false);
  };
  const fixIssue = (nodeId: string, issue: SetupIssue) => {
    setPublishOpen(false);
    focus(nodeId);
    setSettingTarget({ nodeId, control: issue.control });
  };
  const actionableIssues = graph.nodes.flatMap((node) =>
    stepSetupIssues(graph, node).map((issue) => ({ node, issue })),
  );
  const freeInputs = selectedNode
    ? incomingChoices(graph, selectedNode.id).filter(
        (choice) =>
          !connectionIssue(
            graph,
            choice.source,
            selectedNode.id,
            choice.outcome,
          ),
      )
    : [];
  const inspector = selectedNode ? (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          CONFIGURE STEP
        </p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close step settings"
          onClick={() => {
            setSelected(null);
            setNodes((previous) =>
              previous.map((node) => ({ ...node, selected: false })),
            );
          }}
        >
          <X />
        </Button>
      </div>
      <Tabs value={inspectorTab} onValueChange={setInspectorTab}>
        <TabsList className="w-full">
          <TabsTrigger value="parameters">Configure</TabsTrigger>
          <TabsTrigger value="input">Data &amp; behavior</TabsTrigger>
        </TabsList>
        <TabsContent value="input" className="space-y-4 text-sm">
          <div>
            <h3 className="font-medium">Receives</h3>
            <p className="mt-2 text-muted-foreground">
              {DATA_HELP[selectedNode.kind].input}
            </p>
          </div>
          <div>
            <h3 className="font-medium">Produces</h3>
            <p className="mt-2 text-muted-foreground">
              {DATA_HELP[selectedNode.kind].output}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            This describes the draft. Recorded results are available in
            Executions.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (compact) setSelected(null);
              setSampleOpen(true);
            }}
          >
            Preview with sample data
          </Button>
        </TabsContent>
        <TabsContent value="parameters">
          <StepSettings
            pipelineVersionId={graph.nodes.find(n=>n.kind==="resume_uploaded")?.config.pipelineVersionId}
            node={selectedNode}
            options={options}
            disabled={!editable}
            onMetadata={(metadata) =>
              commit({
                ...graph,
                nodes: graph.nodes.map((n) =>
                  n.id === selectedNode.id ? { ...n, ...metadata } : n,
                ),
              })
            }
            onChange={(config) =>
              commit({
                ...graph,
                nodes: graph.nodes.map((n) =>
                  n.id === selectedNode.id ? { ...n, config } : n,
                ),
              })
            }
          />
          {stepSetupIssues(graph, selectedNode).length > 0 && (
            <ul className="my-4 space-y-3 rounded-lg border border-warning/40 p-3 text-sm">
              {stepSetupIssues(graph, selectedNode).map((issue) => (
                <li key={issue.control}>
                  <p>{issue.message}</p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto px-0"
                    onClick={() => fixIssue(selectedNode.id, issue)}
                  >
                    {issue.action} →
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {selectedNode.kind !== "resume_uploaded" &&
            !graph.edges.some((e) => e.target === selectedNode.id) && (
              <section className="my-4 space-y-2 rounded-lg border p-3">
                <label
                  htmlFor="connection-incoming"
                  className="text-sm font-medium"
                >
                  Connect after
                </label>
                <SelectField
                  id="connection-incoming"
                  value=""
                  disabled={!editable}
                  className="h-10 w-full rounded border bg-background px-2 text-sm"
                  onValueChange={(value) => {
                    if (!value) return;
                    const choice = freeInputs[Number(value)];
                    if (choice)
                      connect({
                        source: choice.source,
                        target: selectedNode.id,
                        sourceHandle: choice.outcome,
                        targetHandle: "in",
                      });
                  }}
                  placeholder="Choose a previous step"
                >
                  <SelectFieldOption value="">
                    Choose a previous step
                  </SelectFieldOption>
                  {freeInputs.map((choice, i) => (
                    <SelectFieldOption
                      key={choice.source + choice.outcome}
                      value={i}
                    >
                      {displayNode(
                        graph.nodes.find((n) => n.id === choice.source)!,
                      )}{" "}
                      · {choice.outcome}
                    </SelectFieldOption>
                  ))}
                </SelectField>
                {!freeInputs.length && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      No free outputs. Open a previous step and change its next
                      connection.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (compact) setSelected(null);
                        setOutlineOpen(true);
                      }}
                    >
                      Choose previous step
                    </Button>
                  </>
                )}
              </section>
            )}
          {outcomes(selectedNode.kind).length > 0 ? (
            <section
              className="my-4 rounded-lg border p-3"
              aria-label="Next steps"
            >
              <h3 className="text-sm font-medium">What happens next</h3>
              <div className="mt-3 space-y-3">
                {outcomes(selectedNode.kind).map((outcome) => {
                  const edge = graph.edges.find(
                    (e) =>
                      e.source === selectedNode.id && e.outcome === outcome,
                  );
                  return (
                    <div key={outcome}>
                      <label
                        className="text-xs font-medium capitalize"
                        htmlFor={`connection-${outcome}`}
                      >
                        {outcome === "next" ? "Next step" : outcome}
                      </label>
                      {edge && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="mb-1 h-auto w-full justify-start whitespace-normal px-0 text-left"
                          onClick={() => focus(edge.target)}
                        >
                          Open{" "}
                          {(() => {
                            const target = graph.nodes.find(
                              (n) => n.id === edge.target,
                            );
                            return target
                              ? displayNode(target)
                              : "missing step";
                          })()}{" "}
                          →
                        </Button>
                      )}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          {edge
                            ? "Change connection"
                            : "Connect an existing step"}
                        </summary>
                        <SelectField
                          id={`connection-${outcome}`}
                          disabled={!editable}
                          className="h-10 w-full rounded border bg-background px-2 text-xs"
                          value={edge?.target ?? ""}
                          onValueChange={(value) => {
                            if (!value) {
                              commit({
                                ...graph,
                                edges: graph.edges.filter(
                                  (e) => e.id !== edge?.id,
                                ),
                              });
                              return;
                            }
                            connect(
                              {
                                source: selectedNode.id,
                                target: value,
                                sourceHandle: outcome,
                                targetHandle: "in",
                              },
                              edge
                                ? flowEdges({ nodes: [], edges: [edge] })[0]
                                : undefined,
                            );
                          }}
                          placeholder="Not connected"
                        >
                          <SelectFieldOption value="">
                            Not connected
                          </SelectFieldOption>
                          {graph.nodes
                            .filter(
                              (n) =>
                                n.kind !== "resume_uploaded" &&
                                n.id !== selectedNode.id &&
                                (outcome !== "rejected" ||
                                  selectedNode.kind !== "review_resume" ||
                                  n.kind === "stop"),
                            )
                            .map((n) => (
                              <SelectFieldOption key={n.id} value={n.id}>
                                {displayNode(n)}
                              </SelectFieldOption>
                            ))}
                        </SelectField>
                      </details>
                      <Button
                        id={`step-add-${outcome}`}
                        size="sm"
                        className="mt-1"
                        variant="ghost"
                        disabled={!editable}
                        onClick={() => openPalette(selectedNode.id, outcome)}
                      >
                        + {edge ? "Insert a step" : "Add next step"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="my-4 rounded-lg border p-3 text-sm text-muted-foreground">
              This step ends its path.
            </p>
          )}
          {selectedNode.kind !== "resume_uploaded" && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!editable}
                onClick={() => duplicate()}
              >
                <Copy />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!editable}
                onClick={() => {
                  commit(removeSteps(graph, [selectedNode.id]));
                  setSelected(null);
                }}
              >
                <Trash2 />
                Remove step
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  ) : null;
  const unpublished =
    !!workflow.published &&
    graphIdentity(workflow.published) !== graphIdentity(graph);
  const differences = graphChanges(workflow.published, graph);
  const overlaps = siblings.filter(
    (w) =>
      w.id !== workflow.id &&
      w.active &&
      w.trigger === workflowTrigger(graph) &&
      w.trigger !== "manual",
  );
  return (
    <main
      className="flex h-svh min-w-0 flex-col overflow-hidden bg-background"
      aria-label="Workflow editor"
    >
      <h1 className="sr-only">{name}</h1>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
        <div className="min-w-0 space-y-2">
          <Link href="/workflows" className="text-sm text-muted-foreground">
            ← Automation
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="workflow-name"
              aria-label="Workflow name"
              title={name}
              maxLength={120}
              value={name}
              disabled={!editable}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-64 max-w-full border-transparent bg-transparent text-base font-semibold hover:border-input focus:border-input"
            />
            <Badge variant="secondary">
              {workflow.active
                ? `Live v${workflow.version}`
                : workflow.version
                  ? `Paused · v${workflow.version}`
                  : "Draft"}
            </Badge>
            {unpublished && (
              <Badge
                variant="outline"
                className="text-amber-700 dark:text-amber-300"
              >
                Unpublished changes
              </Badge>
            )}
          </div>
          <p role="status" className="text-xs text-muted-foreground">
            {saveState.startsWith("Save failed")
              ? saveState
              : dirty && saveState !== "Saving…"
                ? "Unsaved changes"
                : saveState}{" "}
            · Draft autosaves.{" "}
            {tab !== "editor" && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => setTab("editor")}
              >
                Return to editor
              </Button>
            )}
            {workflow.published &&
              workflowTrigger(workflow.published) !==
                workflowTrigger(graph) && (
                <span className="block">
                  Published starts when:{" "}
                  {TRIGGER_LABELS[workflowTrigger(workflow.published)]}
                  {!workflow.active ? " · Automatic runs paused" : ""}
                </span>
              )}
          </p>
        </div>
        <div
          aria-label="Workflow actions"
          className="flex max-w-full flex-wrap items-center gap-2"
        >
          <Button
            data-sample-preview-trigger
            variant="outline"
            onClick={() => {
              if (compact) setSelected(null);
              setSampleOpen(true);
            }}
          >
            <Play />
            Test with sample
          </Button>
          <Button
            variant="outline"
            disabled={!editable || !canSaveDraft || !name.trim()}
            onClick={() => void save("save").catch(() => {})}
          >
            <Save />
            Save draft
          </Button>
          <Button
            disabled={!editable}
            onClick={() => {
              setOverlapCheck("checking");
              setPublishOpen(true);
            }}
          >
            {busy && <LoaderCircle className="animate-spin" />}Review &amp;
            publish
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="More workflow actions"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setTab("runs")}>
                Executions
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTab("settings")}>
                Settings &amp; publish history
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setOverviewOpen(true)}>
                <Info />
                Compare draft &amp; live
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!workflow.version || busy || workflow.archived || isApplicationTrigger(workflowTrigger(workflow.published??graph))}
                onSelect={() => setStartOpen(true)}
              >
                <Play />
                Run published workflow…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHelpOpen(true)}>
                Shortcuts &amp; help
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      </header>
      {workflow.archived && (
        <Alert>
          <AlertDescription>
            This workflow is archived.{" "}
            <Link href="/archive" className="underline">
              Restore from Archive
            </Link>{" "}
            before editing or running.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const blob = new Blob(
                      [JSON.stringify(current.current, null, 2)],
                      { type: "application/json" },
                    ),
                    url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "workflow-draft.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download my draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void workflowApi<{ workflow: WorkflowDetail }>(
                    `/api/workflows/${workflow.id}`,
                  )
                    .then((d) => setRecovery(d.workflow))
                    .catch((e) => setError(errorText(e)))
                }
              >
                Review latest version
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsContent
          value="editor"
          forceMount
          className={
            tab !== "editor" ? "hidden" : "flex min-h-0 flex-1 flex-col"
          }
        >
          {preview && (
            <section
              aria-label="Sample preview status"
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {activePreview
                    ? "Sample preview · no real actions performed"
                    : "Sample preview is outdated"}
                </p>
                <p role="status" className="mt-1 text-xs text-muted-foreground">
                  {activePreview
                    ? activePreview.halt
                    : "The draft changed. Preview again to see its new path."}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  data-sample-preview-trigger
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (compact) setSelected(null);
                    setSampleOpen(true);
                  }}
                >
                  Edit sample
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(null)}
                >
                  Clear preview
                </Button>
              </div>
            </section>
          )}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={!editable || nodes.length >= 32}
                onClick={() => openPalette()}
              >
                <Plus />
                Add step
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (compact) setSelected(null);
                  setOutlineOpen(true);
                }}
              >
                <ListOrdered />
                Steps · {nodes.length}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!editable}
                onClick={() => {
                  commit(arrangeGraph(graph));
                  requestAnimationFrame(
                    () =>
                      void flow.fitView({
                        padding: 0.18,
                        maxZoom: 1,
                        duration: 300,
                      }),
                  );
                }}
              >
                <LayoutGrid />
                Auto-arrange
              </Button>
              {selection.length > 1 && (
                <div
                  aria-label="Selection tools"
                  className="flex flex-wrap items-center gap-2 border-l pl-3"
                >
                  <span className="text-xs text-muted-foreground">
                    {selection.length} selected
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" disabled={!editable}>
                        <AlignHorizontalJustifyCenter />
                        Align
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(
                        [
                          "left",
                          "center",
                          "right",
                          "top",
                          "middle",
                          "bottom",
                        ] as const
                      ).map((alignment) => (
                        <DropdownMenuItem
                          key={alignment}
                          onSelect={() => align(alignment)}
                        >
                          Align{" "}
                          {alignment === "center"
                            ? "horizontal centers"
                            : alignment === "middle"
                              ? "vertical centers"
                              : alignment}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!editable || selection.length < 3}
                      >
                        Distribute
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => distribute("x")}>
                        Horizontal spacing
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => distribute("y")}>
                        Vertical spacing
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setValidateOpen(true)}
            >
              {issues.length ? (
                `${issues.length} setup ${issues.length === 1 ? "issue" : "issues"}`
              ) : (
                <>
                  <CheckCircle2 />
                  Graph complete
                </>
              )}
            </Button>
          </div>
          <div
            className={`relative grid min-h-0 min-w-0 flex-1 ${selectedNode && !compact ? "md:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}
          >
            {paletteOpen && (
              <aside
                aria-label="Step catalog"
                style={
                  addContext.anchor
                    ? { left: addContext.anchor.x, top: addContext.anchor.y }
                    : undefined
                }
                className="absolute left-3 top-3 z-20 max-h-[min(70svh,calc(100%-24px))] w-72 max-w-[calc(100%-24px)] overflow-auto rounded-xl border bg-card p-3 shadow-lg"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Add a step</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {addContext.source
                        ? `Insert on ${addContext.outcome} branch`
                        : "Click to add or drag onto the canvas."}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close step catalog"
                    onClick={() => setPaletteOpen(false)}
                  >
                    <X />
                  </Button>
                </div>{" "}
                <StepCatalog
                  graph={graph}
                  source={addContext.source}
                  outcome={addContext.outcome}
                  disabled={!editable}
                  onAdd={add}
                  onFocus={(id) => {
                    setPaletteOpen(false);
                    focus(id);
                  }}
                />
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </aside>
            )}
            <div
              className="relative min-h-0 min-w-0 overflow-hidden bg-muted/20"
              tabIndex={0}
              ref={canvasElement}
              aria-label="Workflow canvas"
              onDragOver={(e) => {
                if (!editable) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const kind = e.dataTransfer.getData(
                  "application/pdfstudio-step",
                ) as StepKind;
                if (STEP_KINDS.includes(kind) && kind !== "resume_uploaded")
                  add(
                    kind,
                    flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                  );
              }}
            >
              <WorkflowCanvas
                nodes={nodes.map((n) => ({
                  ...n,
                  data: {
                    ...n.data,
                    preview: activePreview
                      ? sampleNodeState(activePreview, n.id)
                      : undefined,
                    issues: nodeIssues(
                      graph,
                      graph.nodes.find((g) => g.id === n.id)!,
                    ),
                    onAdd: editable ? openPalette : undefined,
                    connectedOutcomes: graph.edges
                      .filter((e) => e.source === n.id)
                      .map((e) => e.outcome),
                    onAction: editable
                      ? (action, id) => {
                          if (action === "duplicate") duplicate(id);
                          else if (action === "remove") {
                            commit(removeSteps(graph, [id]));
                            setSelected(null);
                          } else focus(id);
                        }
                      : undefined,
                    summary:
                      n.data.kind === "assign_forms"
                        ? (n.data.config.forms ?? [])
                            .map(
                              (f) =>
                                options.find((o) => o.id === f.templateId)
                                  ?.name ?? "Choose form",
                            )
                            .join(", ")
                        : undefined,
                    readOnly: !editable,
                  },
                }))}
                edges={edges.map((e) => ({
                  ...e,
                  ...(activePreview
                    ? { style: sampleEdgeStyle(activePreview, e.id) }
                    : {}),
                  data: {
                    onInsert: editable
                      ? (id) => {
                          const edge = graph.edges.find((e) => e.id === id);
                          if (edge) openPalette(edge.source, edge.outcome);
                        }
                      : undefined,
                  },
                }))}
                showControls={false}
                showMiniMap={false}
                fitView={false}
                guides={guides}
                selectionOnDrag={tool === "select"}
                selectionMode={SelectionMode.Partial}
                multiSelectionKeyCode="Shift"
                selectionKeyCode="Shift"
                panOnDrag={tool === "hand" ? [0, 1, 2] : [1, 2]}
                panActivationKeyCode="Space"
                onMoveEnd={(_, nextViewport) => {
                  if (viewportReady.current) {
                    try {
                      localStorage.setItem(
                        viewportKey,
                        JSON.stringify(nextViewport),
                      );
                    } catch {
                      /* Device storage may be unavailable. */
                    }
                  }
                }}
                onSelectionChange={({ nodes: selectedNodes }) => {
                  setSelected(
                    selectedNodes.length === 1 ? selectedNodes[0].id : null,
                  );
                }}
                onSelectionStart={() => setPaletteOpen(false)}
                onNodesChange={changeNodes}
                onEdgesChange={onEdgesChange}
                onConnect={connect}
                onReconnect={(old, connection) => connect(connection, old)}
                onReconnectStart={(_, edge) => setReconnecting(edge.id)}
                onReconnectEnd={() => setReconnecting(undefined)}
                edgesReconnectable={editable}
                nodesDraggable={editable}
                nodesConnectable={editable}
                isValidConnection={(c) =>
                  editable &&
                  !connectionIssue(
                    graph,
                    c.source,
                    c.target,
                    (c.sourceHandle ?? "next") as WorkflowEdge["outcome"],
                    reconnecting,
                  )
                }
                onConnectEnd={(_, state) => {
                  if (state.fromNode && state.toNode && !state.isValid)
                    setError(
                      connectionIssue(
                        graph,
                        state.fromNode.id,
                        state.toNode.id,
                        (state.fromHandle?.id ??
                          "next") as WorkflowEdge["outcome"],
                        reconnecting,
                      ) ?? "Choose a valid input handle.",
                    );
                }}
                onNodeClick={(event, node) => {
                  setPaletteOpen(false);
                  setInspectorTab("parameters");
                  if (!event.shiftKey) setSelected(node.id);
                }}
                onNodeDoubleClick={(_, n) => focus(n.id)}
                onPaneClick={() => {
                  setSelected(null);
                  setPaletteOpen(false);
                }}
                onNodeDragStart={(event) => {
                  if (editable) {
                    dragStart.current = graph;
                    altPressed.current = event.altKey;
                  }
                }}
                onSelectionDragStart={(event) => {
                  if (editable) {
                    dragStart.current = graph;
                    altPressed.current = event.altKey;
                  }
                }}
                onNodeDragStop={() => finishDrag()}
                onSelectionDragStop={() => finishDrag()}
                deleteKeyCode={null}
              />
              <div
                aria-label="Canvas controls"
                className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border bg-card p-1.5 shadow-lg"
              >
                <Button
                  variant={tool === "select" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Select tool (V)"
                  aria-pressed={tool === "select"}
                  onClick={() => setTool("select")}
                >
                  <MousePointer2 />
                </Button>
                <Button
                  variant={tool === "hand" ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label="Hand tool (H)"
                  aria-pressed={tool === "hand"}
                  onClick={() => setTool("hand")}
                >
                  <Hand />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Undo workflow change"
                  title="Undo · Ctrl/Cmd+Z"
                  disabled={!editable || !past.length}
                  onClick={undo}
                >
                  <Undo2 />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Redo workflow change"
                  title="Redo · Ctrl/Cmd+Shift+Z"
                  disabled={!editable || !future.length}
                  onClick={redo}
                >
                  <Redo2 />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Zoom out"
                  onClick={() => void flow.zoomOut()}
                >
                  <Minus />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Reset zoom to 100%"
                  onClick={() => void flow.zoomTo(1)}
                >
                  {Math.round(viewport.zoom * 100)}%
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Zoom in"
                  onClick={() => void flow.zoomIn()}
                >
                  <Plus />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void flow.fitView({
                      padding: 0.18,
                      maxZoom: 1,
                      duration: 300,
                    })
                  }
                >
                  Fit
                </Button>
              </div>
              {error && (
                <p
                  role="alert"
                  className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-destructive bg-background p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
            </div>
            {selectedNode && !compact && (
              <aside className="min-h-0 min-w-0 overflow-y-auto border-l bg-card p-4">
                {inspector}
              </aside>
            )}
            <Sheet
              open={compact && !!selectedNode}
              onOpenChange={(open) => {
                if (!open) {
                  setSelected(null);
                  setNodes((previous) =>
                    previous.map((node) => ({ ...node, selected: false })),
                  );
                }
              }}
            >
              <SheetContent
                side="bottom"
                onCloseAutoFocus={(event) => { event.preventDefault(); canvasElement.current?.focus(); }}
                showCloseButton={false}
                className="max-h-[80svh] w-full overflow-y-auto p-4"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Step settings</SheetTitle>
                  <SheetDescription>
                    Configure the selected workflow step.
                  </SheetDescription>
                </SheetHeader>
                {inspector}
              </SheetContent>
            </Sheet>
          </div>
        </TabsContent>
        <TabsContent
          value="runs"
          className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
        >
          <WorkflowRunsView
            workflowId={workflow.id}
            preferenceKey={preferenceKey}
          />
        </TabsContent>
        <TabsContent
          value="settings"
          className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6"
        >
          <WorkflowReadiness
            id={workflow.id}
            graph={graph}
            onFocus={(id) => {
              setTab("editor");
              setSelected(id);
            }}
          />
          <PublishHistory
            id={workflow.id}
            current={workflow.version}
            graph={graph}
            disabled={busy || !!workflow.archived}
            onRestore={async (version) => {
              setBusy(true);
              try {
                await save("save");
                const { workflow: restored } = await workflowApi<{
                  workflow: WorkflowDetail;
                }>(`/api/workflows/${workflow.id}/versions`, {
                  method: "POST",
                  body: JSON.stringify({
                    version,
                    expectedUpdatedAt: revision.current,
                  }),
                });
                revision.current = restored.updatedAt;
                setWorkflow(restored);
                setName(restored.name);
                restore(restored.draft);
                const signature = JSON.stringify([
                  restored.name,
                  parseDraftGraph(restored.draft) ?? restored.draft,
                ]);
                saved.current = signature;
                setSavedFingerprint(signature);
                setPast([]);
                setFuture([]);
                setError("");
                setSaveState("Saved");
                setNotice(
                  "Published version restored as a draft. Review it before publishing.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Workflow activation</h2>
              <p className="text-sm text-muted-foreground">
                Draft starting event: {TRIGGER_LABELS[workflowTrigger(graph)]}.
                Publish to activate draft changes. Existing executions retain
                their saved version.
              </p>
              {workflow.active && (
                <Button
                  variant="outline"
                  disabled={busy || workflow.archived}
                  onClick={() => void save("pause").catch(() => {})}
                >
                  <Pause />
                  Pause new automatic runs
                </Button>
              )}
              <p className="text-sm text-muted-foreground">
                Pausing does not cancel current runs. Manual execution uses the
                published version. AI processing always requires a separate
                confirmed action in the CV editor.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog open={outlineOpen} onOpenChange={setOutlineOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Workflow steps</DialogTitle>
            <DialogDescription>
              Follow each path from the starting event. Choose a step to
              configure it.
            </DialogDescription>
          </DialogHeader>
          <WorkflowOutline
            graph={graph}
            onSelect={(id) => {
              setOutlineOpen(false);
              focus(id);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Draft &amp; published behavior</DialogTitle>
            <DialogDescription>
              Draft edits affect future runs only after publishing. Existing
              executions keep their saved version.
            </DialogDescription>
          </DialogHeader>
          <div
            className={`grid min-w-0 gap-4 ${workflow.published ? "md:grid-cols-2" : ""}`}
          >
            <BusinessSummaryCard graph={graph} title="Draft behavior" />
            {workflow.published ? (
              <BusinessSummaryCard
                graph={workflow.published}
                title={
                  workflow.active
                    ? "Published behavior"
                    : "Published behavior (paused)"
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This workflow has not been published.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Sheet open={validateOpen} onOpenChange={setValidateOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Workflow setup check</SheetTitle>
            <SheetDescription>
              Incomplete drafts can be saved. Publishing requires complete
              connections and approval paths.
            </SheetDescription>
          </SheetHeader>
          {(!name.trim() || name.length > 120) && (
            <section className="space-y-2 rounded-lg border p-3 text-sm">
              <p>Enter a workflow name within 120 characters.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setValidateOpen(false);
                  setSelected(null);
                  setSettingTarget({ nodeId: null, control: "workflow-name" });
                }}
              >
                Enter workflow name →
              </Button>
            </section>
          )}
          {actionableIssues.map(({ node, issue }) => (
            <section
              key={node.id + issue.control}
              className="space-y-2 rounded-lg border p-3 text-sm"
            >
              <h3 className="font-medium">{displayNode(node)}</h3>
              <p className="text-muted-foreground">{issue.message}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fixIssue(node.id, issue)}
              >
                {issue.action} →
              </Button>
            </section>
          ))}
          {issues.length ? (
            <details
              open={!actionableIssues.length}
              className="rounded-lg border p-3"
            >
              <summary className="cursor-pointer text-sm font-medium">
                Full graph checks · {issues.length}
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                For ordering or loops, change the next connection in step
                settings. Select a connection and press Delete to remove it.
              </p>
            </details>
          ) : (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Graph checks pass. Review integrations and changes before
              publishing.
            </p>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Publish workflow</DialogTitle>
            <DialogDescription>
              New runs use this version. Existing executions keep their original
              settings and history.
            </DialogDescription>
          </DialogHeader>
          <WorkflowReadiness id={workflow.id} graph={graph} />
          <div className="rounded-lg border p-3">
            <p className="mb-2 font-medium">Changes from live version</p>
            <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
              {differences.length ? (
                differences.map((change) => <li key={change}>{change}</li>)
              ) : (
                <li>No graph changes.</li>
              )}
            </ul>
          </div>
          {overlapCheck === "checking" && (
            <p className="text-sm text-muted-foreground">
              Checking other active workflows…
            </p>
          )}
          {overlapCheck === "failed" && (
            <Alert variant="destructive">
              <AlertDescription>
                Could not check other active workflows.
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOverlapCheck("checking");
                    setOverlapAttempt((n) => n + 1);
                  }}
                >
                  Retry check
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {overlaps.length > 0 && (
            <Alert>
              <AlertDescription>
                Other active workflows use this starting event. All matching
                workflows may run.
                <ul>
                  {overlaps.map((w) => (
                    <li key={w.id}>
                      <Link href={`/workflows/${w.id}`} className="underline">
                        {w.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm">
            Starts when:{" "}
            <strong>{TRIGGER_LABELS[workflowTrigger(graph)]}</strong>
          </p>
          <p className="text-sm">
            {nodes.length} steps · {edges.length} connections
          </p>
          {issues.length > 0 && (
            <div className="rounded border border-amber-300 p-3 text-sm">
              <p className="font-medium">
                Resolve {issues.length} setup issues first.
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  setPublishOpen(false);
                  setValidateOpen(true);
                }}
              >
                Review setup issues
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Approved paths can create accounts, assign forms and send Telegram
            invitations. Editing or saving a draft never executes them.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={
              busy || issues.length > 0 || !editable || overlapCheck !== "ready"
            }
            onClick={() =>
              void save("publish")
                .then(() => setPublishOpen(false))
                .catch(() => {})
            }
          >
            Confirm publish
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Run published workflow · v{workflow.version}
            </DialogTitle>
            <DialogDescription>
              This starts a real preparation run using the published version,
              including accounts, forms and invitations after required approval.
              Unsaved draft changes are not used. A CV runs once per workflow.
            </DialogDescription>
          </DialogHeader>
          <StartExisting
            workflowId={workflow.id}
            onStarted={() => {
              setStartOpen(false);
              setTab("runs");
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={sampleOpen} onOpenChange={setSampleOpen}>
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-4xl"
          style={
            { "--tw-enter-scale": 1, "--tw-exit-scale": 1 } as CSSProperties
          }
          onPointerDownOutside={(event) => {
            // An exiting dialog must not dismiss a preview that its trigger just reopened.
            const target = event.detail.originalEvent.target;
            if (
              target instanceof Element &&
              target.closest("[data-sample-preview-trigger]")
            )
              event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Test with sample data</DialogTitle>
            <DialogDescription>
              Preview the current draft without running a live workflow.
            </DialogDescription>
          </DialogHeader>
          <SampleTest
            graph={graph}
            options={options}
            onFocus={focus}
            initialSample={preview?.sample}
            onShowPath={(result, sample) => {
              setPreview({ signature: graphIdentity(graph), result, sample });
              setSampleOpen(false);
              setSelected(null);
              setPaletteOpen(false);
              setTab("editor");
              requestAnimationFrame(
                () => void flow.fitView({ padding: 0.25, duration: 300 }),
              );
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!recovery}
        onOpenChange={(open) => {
          if (!open) setRecovery(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recover your draft</DialogTitle>
            <DialogDescription>
              The latest saved version was loaded for comparison. Your edits are
              still here.
            </DialogDescription>
          </DialogHeader>
          {recovery && (
            <>
              <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-sm">
                {graphChanges(recovery.draft, graph).map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <p className="text-sm">
                Reloading discards your unsaved edits. Download your draft first
                if you want to keep a copy.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  revision.current = recovery.updatedAt;
                  setWorkflow(recovery);
                  setName(recovery.name);
                  restore(recovery.draft);
                  const signature = JSON.stringify([
                    recovery.name,
                    parseDraftGraph(recovery.draft) ?? recovery.draft,
                  ]);
                  saved.current = signature;
                  setSavedFingerprint(signature);
                  setPast([]);
                  setFuture([]);
                  setError("");
                  setSaveState("Saved");
                  setRecovery(null);
                }}
              >
                Discard my edits and load latest
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Canvas shortcuts</DialogTitle>
            <DialogDescription>
              All graph edits affect the draft until published.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            <li>
              Drag nodes to move. Drag empty canvas to select a group;
              Shift-click adds to the selection.
            </li>
            <li>
              Use Hand (H) or hold Space to pan; Select (V) returns to
              selection. Scroll/pinch to zoom.
            </li>
            <li>
              Pink guides snap edges and centers. Hold Alt/Option to move
              freely.
            </li>
            <li>
              Select two steps to align them, or three to distribute their
              spacing. Fit changes the view; Auto-arrange changes node
              positions.
            </li>
            <li>Use + on a node output or connection to insert a step.</li>
            <li>
              Drag connection endpoints to reconnect; click a line and press
              Delete to disconnect.
            </li>
            <li>
              Shift-click nodes for multiple selection; Ctrl/Cmd+D duplicates
              selected steps.
            </li>
            <li>
              Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl+Y redoes; Delete
              removes selected steps.
            </li>
            <li>
              The starting event is protected. Cycles and invalid rejection
              paths are blocked.
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </main>
  );
}
function StartExisting({
  workflowId,
  onStarted,
}: {
  workflowId: string;
  onStarted: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<{ id: string; fileName: string }[]>([]);
  const [search, setSearch] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void workflowApi<{ items: { id: string; fileName: string }[] }>(
        `/api/resumes?search=${encodeURIComponent(search)}&pageSize=20`,
        { signal: controller.signal },
      )
        .then((d) => setItems(d.items))
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      await workflowApi("/api/workflow-runs", {
        method: "POST",
        body: JSON.stringify({ workflowId, resumeId }),
      });
      onStarted();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <WorkflowReadiness id={workflowId} onReady={setReady} />
      <Input
        placeholder="Search resume…"
        aria-label="Search resume"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select value={resumeId} onValueChange={setResumeId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose existing CV" />
        </SelectTrigger>
        <SelectContent>
          {items.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.fileName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        disabled={!resumeId || busy || !ready}
        onClick={() => void start()}
      >
        {busy && <LoaderCircle className="animate-spin" />} Start workflow
      </Button>
    </div>
  );
}
