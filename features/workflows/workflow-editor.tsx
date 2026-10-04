"use client";
import { BusinessSummaryCard } from "./business-summary-card";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
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
  Maximize2,
  Minimize2,
  Search,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
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
  STEP_LABELS,
  workflowTrigger,
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
    <AppShell displayName={props.displayName} fullWidth>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {workflow ? (
        <ReactFlowProvider>
          <EditorBody
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
    </AppShell>
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
  const [focusMode, setFocusMode] = useState(false),
    [sampleOpen, setSampleOpen] = useState(false),
    [nodeSearch, setNodeSearch] = useState(""),
    [inspectorTab, setInspectorTab] = useState("parameters");
  const [recovery, setRecovery] = useState<WorkflowDetail | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
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
    [initial.id],
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
    if (!editable) return;
    setPast((p) => [...p, graph].slice(-50));
    setFuture([]);
    setNodes(flowNodes(next));
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
    if (compact) setSelected(null);
    if (!editable) return;
    setAddContext({ source, outcome: outcome as WorkflowEdge["outcome"] });
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
  const selectedNode = graph.nodes.find((n) => n.id === selected);
  const select = (id: string) => {
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
  const inspector = selectedNode ? (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          STEP SETTINGS
        </p>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close step settings"
          onClick={() => setSelected(null)}
        >
          <X />
        </Button>
      </div>
      <Tabs value={inspectorTab} onValueChange={setInspectorTab}>
        <TabsList className="w-full">
          <TabsTrigger value="parameters">Parameters</TabsTrigger>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>
        <TabsContent value="input" className="space-y-3 text-sm">
          <p>{DATA_HELP[selectedNode.kind].input}</p>
          <p className="text-muted-foreground">
            This is a draft. Open an execution to inspect recorded input, or
            preview the planned path with sample data.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (compact) setSelected(null);
              setSampleOpen(true);
            }}
          >
            Test with sample data
          </Button>
        </TabsContent>
        <TabsContent value="output" className="space-y-3 text-sm">
          <p>{DATA_HELP[selectedNode.kind].output}</p>
          <p className="text-muted-foreground">
            No live result exists for draft changes.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (compact) setSelected(null);
              setSampleOpen(true);
            }}
          >
            Preview planned result
          </Button>
        </TabsContent>
        <TabsContent value="parameters">
          <StepSettings
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
          {nodeIssues(graph, selectedNode).length > 0 && (
            <ul className="my-4 space-y-1 rounded border border-amber-300 p-3 text-xs text-amber-800 dark:text-amber-300">
              {nodeIssues(graph, selectedNode).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <details className="my-4 rounded border p-3" open>
            <summary className="cursor-pointer text-sm font-medium">
              Connections
            </summary>
            <div className="mt-3 space-y-3">
              {outcomes(selectedNode.kind).map((outcome) => {
                const edge = graph.edges.find(
                  (e) => e.source === selectedNode.id && e.outcome === outcome,
                );
                return (
                  <div key={outcome}>
                    <label
                      className="text-xs"
                      htmlFor={`connection-${outcome}`}
                    >
                      {outcome === "next" ? "Next step" : outcome}
                    </label>
                    <select
                      id={`connection-${outcome}`}
                      disabled={!editable}
                      className="h-10 w-full rounded border bg-background px-2 text-xs"
                      value={edge?.target ?? ""}
                      onChange={(e) => {
                        if (!e.target.value) {
                          commit({
                            ...graph,
                            edges: graph.edges.filter((e) => e.id !== edge?.id),
                          });
                          return;
                        }
                        connect(
                          {
                            source: selectedNode.id,
                            target: e.target.value,
                            sourceHandle: outcome,
                            targetHandle: "in",
                          },
                          edge
                            ? flowEdges({ nodes: [], edges: [edge] })[0]
                            : undefined,
                        );
                      }}
                    >
                      <option value="">Not connected</option>
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
                          <option key={n.id} value={n.id}>
                            {displayNode(n)} · {n.id.slice(0, 8)}
                          </option>
                        ))}
                    </select>
                    <Button
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
          </details>
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
    <div
      className={
        focusMode
          ? "fixed inset-0 z-40 space-y-6 overflow-y-auto bg-background p-3 sm:p-6"
          : "min-w-0 space-y-6"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link href="/workflows" className="text-sm text-muted-foreground">
            ← Workflows
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Workflow name"
              maxLength={120}
              value={name}
              disabled={!editable}
              onChange={(e) => setName(e.target.value)}
              className="w-80 max-w-full text-lg font-semibold"
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
            · Draft trigger: {TRIGGER_LABELS[workflowTrigger(graph)]}
            {workflow.published && (
              <span className="block">
                Live trigger:{" "}
                {TRIGGER_LABELS[workflowTrigger(workflow.published)]}
                {!workflow.active ? " · Automatic runs paused" : ""}
              </span>
            )}
          </p>
        </div>
        <div aria-label="Workflow actions" className="flex w-full flex-wrap items-center gap-2 rounded-lg border bg-card p-3 xl:w-auto">
          <Button
            variant="outline"
            onClick={() => {
              if (compact) setSelected(null);
              setSampleOpen(true);
            }}
          >
            Test with sample data
          </Button>
          {workflow.version > 0 && (
            <Button
              variant="outline"
              disabled={busy || workflow.archived}
              onClick={() => setStartOpen(true)}
            >
              <Play />
              Run published workflow
            </Button>
          )}
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
            {busy && <LoaderCircle className="animate-spin" />}Review changes
            &amp; publish
          </Button>
        </div>
      </div>
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
      {tab === "editor" && (
        <div className={`grid min-w-0 gap-4 ${workflow.published ? "lg:grid-cols-2" : ""}`}>
          <BusinessSummaryCard graph={graph} title="Draft behavior" />
          {workflow.published && (
            <BusinessSummaryCard
              graph={workflow.published}
              title={
                workflow.active
                  ? "Published behavior"
                  : "Published behavior (automatic runs paused)"
              }
            />
          )}
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full gap-1">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="runs">Executions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent
          value="editor"
          forceMount
          className={tab !== "editor" ? "hidden" : "mt-4"}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2">
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                disabled={!editable || nodes.length >= 32}
                onClick={() => openPalette()}
              >
                <Plus />
                Add step
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Undo workflow change"
                disabled={!editable || !past.length}
                onClick={undo}
              >
                <Undo2 />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Redo workflow change"
                disabled={!editable || !future.length}
                onClick={redo}
              >
                <Redo2 />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!editable}
                onClick={() => {
                  commit(arrangeGraph(graph));
                  requestAnimationFrame(
                    () => void flow.fitView({ padding: 0.25, duration: 300 }),
                  );
                }}
              >
                <LayoutGrid />
                Auto-arrange
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void flow.fitView({ padding: 0.25, duration: 300 })
                }
              >
                Fit workflow
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setValidateOpen(true)}
              >
                {issues.length ? (
                  `${issues.length} setup issues`
                ) : (
                  <>
                    <CheckCircle2 />
                    Ready to publish
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFocusMode(!focusMode)}
              >
                {focusMode ? <Minimize2 /> : <Maximize2 />}
                {focusMode ? "Exit focus mode" : "Focus mode"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setHelpOpen(true)}
              >
                Shortcuts & help
              </Button>
            </div>
          </div>
          <div className="relative mb-3 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Find workflow step"
              placeholder="Find a step…"
              className="pl-9"
              value={nodeSearch}
              onChange={(e) => setNodeSearch(e.target.value)}
            />
            {nodeSearch && (
              <div className="absolute top-full z-20 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-2 shadow-lg">
                {graph.nodes
                  .filter((n) =>
                    (displayNode(n) + " " + (n.note ?? ""))
                      .toLowerCase()
                      .includes(nodeSearch.toLowerCase()),
                  )
                  .map((n) => (
                    <Button
                      key={n.id}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => {
                        focus(n.id);
                        setNodeSearch("");
                      }}
                    >
                      {displayNode(n)}
                    </Button>
                  ))}
                {!graph.nodes.some((n) =>
                  (displayNode(n) + " " + (n.note ?? ""))
                    .toLowerCase()
                    .includes(nodeSearch.toLowerCase()),
                ) && <p className="p-2 text-sm">No matching steps.</p>}
              </div>
            )}
          </div>
          <div
            className={`grid min-w-0 items-start gap-3 ${paletteOpen ? (selectedNode ? "xl:grid-cols-[240px_minmax(0,1fr)_340px]" : "xl:grid-cols-[240px_minmax(0,1fr)]") : selectedNode ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}
            onKeyDown={(e) => {
              if (
                !editable ||
                (e.target as Element).closest(
                  "input,textarea,select,[contenteditable=true]",
                )
              )
                return;
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
              }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
                e.preventDefault();
                duplicate();
              }
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                remove();
              }
              if (e.key === "Escape") setSelected(null);
            }}
          >
            {paletteOpen && (
              <aside
                aria-label="Step catalog"
                className="max-h-[70svh] min-w-0 overflow-auto rounded-xl border bg-card p-3"
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
              className={`relative ${focusMode ? "h-[calc(100svh-240px)]" : "h-[calc(100svh-330px)]"} min-h-[420px] min-w-0 overflow-hidden rounded-xl border bg-muted/20`}
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
                    issues: nodeIssues(
                      graph,
                      graph.nodes.find((g) => g.id === n.id)!,
                    ),
                    onAdd: editable ? openPalette : undefined,
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
                  data: {
                    onInsert: editable
                      ? (id) => {
                          const edge = graph.edges.find((e) => e.id === id);
                          if (edge) openPalette(edge.source, edge.outcome);
                        }
                      : undefined,
                  },
                }))}
                onNodesChange={onNodesChange}
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
                onNodeClick={(_, n) => {
                  setSelected(n.id);
                  setInspectorTab("parameters");
                }}
                onNodeDoubleClick={(_, n) => focus(n.id)}
                onPaneClick={() => setSelected(null)}
                onNodeDragStart={() => {
                  if (editable) {
                    setPast((p) => [...p, graph].slice(-50));
                    setFuture([]);
                  }
                }}
                deleteKeyCode={null}
              />
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
              <aside className="max-h-[80svh] min-w-0 overflow-y-auto rounded-xl border bg-card p-4">
                {inspector}
              </aside>
            )}
            <Sheet
              open={compact && !!selectedNode}
              onOpenChange={(open) => {
                if (!open) setSelected(null);
              }}
            >
              <SheetContent className="w-full overflow-y-auto p-4 sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Step settings</SheetTitle>
                </SheetHeader>
                {inspector}
              </SheetContent>
            </Sheet>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Drag nodes to arrange. Use + to add a connected step. Drag output
            handles to input handles, or use Connections in step settings. Draft
            changes autosave; executions use the published version.
          </p>
        </TabsContent>
        <TabsContent value="runs" className="mt-4">
          <WorkflowRunsView
            workflowId={workflow.id}
            preferenceKey={preferenceKey}
          />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
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
      <Sheet open={validateOpen} onOpenChange={setValidateOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Workflow setup check</SheetTitle>
            <SheetDescription>
              Incomplete drafts can be saved. Publishing requires complete
              connections and approval paths.
            </SheetDescription>
          </SheetHeader>
          {graph.nodes
            .filter((n) => nodeIssues(graph, n).length)
            .map((n) => (
              <button
                key={n.id}
                className="rounded border p-3 text-left text-sm hover:bg-muted"
                onClick={() => focus(n.id)}
              >
                <strong>{STEP_LABELS[n.kind]}</strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {nodeIssues(graph, n).join(" ")} → Open step
                </span>
              </button>
            ))}
          {issues.length ? (
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-700">
              All graph checks pass. Ready to publish.
            </p>
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
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
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Test with sample data</DialogTitle>
            <DialogDescription>
              Preview the current draft without running a live workflow.
            </DialogDescription>
          </DialogHeader>
          <SampleTest graph={graph} options={options} onFocus={focus} />
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
              Drag nodes to move; drag the canvas to pan; scroll/pinch to zoom.
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
              Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes; Delete removes
              selected steps.
            </li>
            <li>
              The starting event is protected. Cycles and invalid rejection
              paths are blocked.
            </li>
          </ul>
        </DialogContent>
      </Dialog>
    </div>
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
