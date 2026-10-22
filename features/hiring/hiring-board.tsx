"use client";
import { resolvePipelineReference } from "./pipeline-references";
import { ArchiveButton } from "@/features/archive/archive-button";
import { DeleteButton } from "@/features/archive/delete-button";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Columns3,
  List,
  Plus,
  RefreshCw,
  GripVertical,
  MoveRight,
  Search,
  Settings2,
  Clock3,
  UsersRound,
  MoreHorizontal,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { HiringApplication } from "./hiring";
import {
  applicationStatusLabel,
  stageAgeLabel,
  applicationAppointmentLabel,
} from "./presentation";
import { startBoardAutoScroll, type DragPoint } from "./board-auto-scroll";
import {
  useHiringConfiguration,
  stageTone,
  type HiringConfiguration,
} from "./client";

type BoardData = {
  items: HiringApplication[];
  total: number;
  page: number;
  pageSize: number;
  stats: Record<string, number>;
};
const defaults = {
  pipeline: "",
  queue: "pipeline",
  candidate: "",
  job: "",
  search: "",
  stage: "",
  closed: "false",
  page: "1",
  view: "kanban",
  sort: "recent",
};
const valid = (key: keyof typeof defaults, value: string) =>
  key === "view"
    ? ["kanban", "list"].includes(value)
    : key === "sort"
      ? ["recent", "waiting", "newest"].includes(value)
      : key === "closed"
        ? ["true", "false"].includes(value)
        : key === "page"
          ? /^[1-9]\d{0,5}$/.test(value)
          : value.length <= 200;
export function HiringBoard({
  displayName,
  preferenceKey,
}: {
  displayName: string;
  preferenceKey: string;
}) {
  const {
      config,
      error: configError,
      reload: reloadConfig,
    } = useHiringConfiguration(),
    { filters, setFilters, ready } = useUrlFilters(
      defaults,
      valid,
      preferenceKey,
    );
  const [data, setData] = useState<BoardData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [adding, setAdding] = useState(false),
    [draggingApp, setDraggingApp] = useState<HiringApplication | null>(null),
    [overStage, setOverStage] = useState<string | null>(null),
    [recentMove, setRecentMove] = useState<{
      id: string;
      stage: string;
    } | null>(null),
    [move, setMove] = useState<{
      app: HiringApplication;
      target: string;
    } | null>(null);
  const drag = useRef<HiringApplication | null>(null),
    dragPoint = useRef<DragPoint | null>(null),
    board = useRef<HTMLDivElement>(null),
    loadNumber = useRef(0);
  const draggingId = draggingApp?.id ?? null;
  const endDrag = useCallback(() => {
    drag.current = null;
    dragPoint.current = null;
    setDraggingApp(null);
    setOverStage(null);
  }, []);
  const versionId = resolvePipelineReference(
    config ?? {},
    filters.pipeline === "all"
      ? ""
      : filters.pipeline ||
          config?.pipelines.find((p) => p.isDefault)?.currentVersionId ||
          config?.versions.find((v) => !v.archived)?.id ||
          "",
  );
  const version = config?.versions.find((v) => v.id === versionId),
    view =
      version && filters.closed !== "true" && filters.queue === "pipeline"
        ? filters.view
        : "list";
  const query = new URLSearchParams({
    ...filters,
    pipeline: versionId,
  }).toString();
  const reload = useCallback(async () => {
    if (!ready || !config) return;
    const n = ++loadNumber.current;
    setLoading(true);
    try {
      const result = await workflowApi<BoardData>(
        `/api/hiring/applications?${query}`,
      );
      if (n === loadNumber.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (n === loadNumber.current) setError(errorText(e));
    } finally {
      if (n === loadNumber.current) setLoading(false);
    }
  }, [ready, config, query]);
  const cancelRequests = useCallback(() => {
    loadNumber.current++;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0),
      interval = setInterval(() => {
        if (!drag.current) void reload();
      }, 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      cancelRequests();
    };
  }, [reload, cancelRequests]);
  useEffect(() => {
    if (!draggingId || !board.current) return;
    const scroller = startBoardAutoScroll(
      board.current,
      () => dragPoint.current,
      setOverStage,
    );
    function track(event: DragEvent) {
      dragPoint.current = { x: event.clientX, y: event.clientY };
      scroller.update(performance.now());
    }
    function leave(event: DragEvent) {
      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        dragPoint.current = null;
        setOverStage(null);
      }
    }
    function visibility() {
      if (document.hidden) endDrag();
    }
    document.addEventListener("dragover", track);
    document.addEventListener("dragleave", leave);
    document.addEventListener("drop", endDrag);
    document.addEventListener("dragend", endDrag);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", endDrag);
    return () => {
      scroller.stop();
      document.removeEventListener("dragover", track);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("drop", endDrag);
      document.removeEventListener("dragend", endDrag);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", endDrag);
    };
  }, [draggingId, endDrag]);
  useEffect(() => {
    if (!recentMove) return;
    const timer = setTimeout(() => setRecentMove(null), 1500);
    return () => clearTimeout(timer);
  }, [recentMove]);
  useEffect(() => {
    if (!recentMove || move || view !== "kanban" || !data) return;
    const frame = requestAnimationFrame(() => {
      const container = board.current;
      const card = container?.querySelector(
        `[data-hiring-stage="${CSS.escape(recentMove.stage)}"] [data-application-id="${CSS.escape(recentMove.id)}"]`,
      );
      const column = container?.querySelector(
        `[data-hiring-stage="${CSS.escape(recentMove.stage)}"]`,
      );
      (card ?? column)?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [recentMove, move, view, data]);
  const stageName = (app: HiringApplication) =>
    config?.versions
      .find((v) => v.id === app.pipelineVersionId)
      ?.definition.stages.find((s) => s.id === app.stageId)?.name ??
    app.stageId;
  const hasFilters = !!(
    filters.search ||
    filters.job ||
    filters.stage ||
    filters.candidate
  );
  const clearFilters = () =>
    setFilters({ search: "", job: "", stage: "", candidate: "", page: "1" });
  return (
    <AppShell displayName={displayName} fullWidth={view === "kanban"}>
      <PageHeader
        title="Hiring pipeline"
        description="Keep every application moving. Review candidates, manage interviews, and track the next step in one place."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/hiring/pipelines">
                <Settings2 /> Manage pipelines & jobs
              </Link>
            </Button>
            <Button
              disabled={!config?.versions.some((v) => !v.archived)}
              onClick={() => setAdding(true)}
            >
              <Plus />
              Add application
            </Button>
          </>
        }
      />
      {(error || configError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error || configError}{" "}
            <Button
              variant="link"
              onClick={() => {
                void reloadConfig();
                void reload();
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!config ? (
        !configError && <BoardLoading label="Loading hiring pipelines…" />
      ) : !config.versions.length ? (
        <div className="space-y-4 rounded-xl border border-dashed p-8">
          <h2 className="text-lg font-semibold">
            Create your first hiring model
          </h2>
          <p className="text-sm text-muted-foreground">
            Publish a pipeline, create a job opening, then add applications.
          </p>
          <Button asChild>
            <Link href="/hiring/pipelines">Configure hiring pipeline</Link>
          </Button>
        </div>
      ) : (
        <>
          <section
            aria-label="Application filters"
            className="space-y-4 rounded-xl border bg-card p-4 shadow-xs"
          >
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.7fr)]">
              <div className="space-y-2">
                <Label htmlFor="hiring-work-view">Work view</Label>
                <SelectField
                  id="hiring-work-view"
                  aria-describedby="hiring-work-help"
                  className="w-full"
                  value={filters.queue}
                  onValueChange={(queue) =>
                    setFilters({
                      queue,
                      pipeline: queue === "pipeline" ? filters.pipeline : "all",
                      stage: "",
                      closed: "false",
                      page: "1",
                    })
                  }
                >
                  <SelectFieldOption value="pipeline">
                    Pipeline
                  </SelectFieldOption>
                  <SelectFieldOption value="attention">
                    Needs attention
                  </SelectFieldOption>
                  <SelectFieldOption value="upcoming">
                    Upcoming interviews
                  </SelectFieldOption>
                  <SelectFieldOption value="paused">
                    On hold / interviews paused
                  </SelectFieldOption>
                  <SelectFieldOption value="follow_up">
                    Interview follow-up due
                  </SelectFieldOption>
                </SelectField>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="board-pipeline">Pipeline</Label>
                <SelectField
                  id="board-pipeline"
                  className="w-full"
                  value={filters.pipeline === "all" ? "all" : versionId}
                  onValueChange={(pipeline) =>
                    setFilters({ pipeline, job: "", stage: "", page: "1" })
                  }
                >
                  <SelectFieldOption value="all">
                    All pipelines · list
                  </SelectFieldOption>
                  {config.versions.map((v) => (
                    <SelectFieldOption key={v.id} value={v.id}>
                      {v.name}
                      {v.archived ? " · Archived" : ""}
                    </SelectFieldOption>
                  ))}
                </SelectField>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="board-job">Job opening</Label>
                <SelectField
                  id="board-job"
                  className="w-full"
                  value={filters.job}
                  placeholder="All jobs"
                  onValueChange={(job) => setFilters({ job, page: "1" })}
                >
                  <SelectFieldOption value="">All jobs</SelectFieldOption>
                  {config.jobs
                    .filter(
                      (j) =>
                        !versionId ||
                        j.pipelineVersionId === versionId ||
                        j.id === filters.job,
                    )
                    .map((j) => (
                      <SelectFieldOption key={j.id} value={j.id}>
                        {j.title}
                        {j.archived ? " · Closed" : ""}
                      </SelectFieldOption>
                    ))}
                </SelectField>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="board-search">Search applications</Label>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="board-search"
                    className="pl-9"
                    placeholder="Name, email or job"
                    maxLength={200}
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ search: e.target.value, page: "1" })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="board-status">Status</Label>
                <SelectField
                  id="board-status"
                  className="w-full"
                  value={filters.closed}
                  onValueChange={(closed) => setFilters({ closed, page: "1" })}
                >
                  <SelectFieldOption value="false">Active</SelectFieldOption>
                  <SelectFieldOption value="true">Closed</SelectFieldOption>
                </SelectField>
              </div>
            </div>
            <p
              id="hiring-work-help"
              className="text-xs leading-5 text-muted-foreground"
            >
              {filters.queue === "attention"
                ? "Applications needing job assignment, CV or document review, interview follow-up, or help with automation."
                : filters.queue === "upcoming"
                  ? "Scheduled interviews, including past appointments that still need attendance recorded."
                  : filters.queue === "paused"
                    ? "Applications on hold and applications whose interview process is paused."
                    : filters.queue === "follow_up"
                      ? "Paused interviews whose follow-up date has arrived."
                      : "Track applications across your published hiring stages."}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium" role="status">
                  {data
                    ? `${data.total} ${data.total === 1 ? "application" : "applications"}`
                    : error
                      ? "Applications unavailable"
                      : "Loading applications…"}
                </span>
                {filters.candidate && (
                  <Badge variant="outline">Candidate filter active</Badge>
                )}
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="board-sort" className="sr-only">
                    Sort applications
                  </Label>
                  <SelectField
                    id="board-sort"
                    value={filters.sort}
                    onValueChange={(sort) => setFilters({ sort, page: "1" })}
                  >
                    <SelectFieldOption value="recent">
                      {filters.queue === "upcoming"
                        ? "Soonest interview"
                        : "Recent activity"}
                    </SelectFieldOption>
                    <SelectFieldOption value="waiting">
                      Longest in stage
                    </SelectFieldOption>
                    <SelectFieldOption value="newest">
                      Newest application
                    </SelectFieldOption>
                  </SelectField>
                </div>
                <div
                  role="group"
                  aria-label="Application view"
                  className="flex gap-2 rounded-lg bg-muted p-1"
                >
                  <Button
                    variant="ghost"
                    className={
                      view === "kanban"
                        ? "bg-background shadow-xs hover:bg-background"
                        : "text-muted-foreground"
                    }
                    size="sm"
                    aria-pressed={view === "kanban"}
                    disabled={
                      !version ||
                      filters.closed === "true" ||
                      filters.queue !== "pipeline"
                    }
                    onClick={() => setFilters({ view: "kanban" })}
                  >
                    <Columns3 />
                    Board
                  </Button>
                  <Button
                    variant="ghost"
                    className={
                      view === "list"
                        ? "bg-background shadow-xs hover:bg-background"
                        : "text-muted-foreground"
                    }
                    size="sm"
                    aria-pressed={view === "list"}
                    onClick={() => setFilters({ view: "list" })}
                  >
                    <List />
                    List
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Refresh applications"
                  disabled={loading}
                  onClick={() => void reload()}
                >
                  <RefreshCw className={loading ? "animate-spin" : ""} />
                </Button>
              </div>
            </div>
          </section>
          {filters.stage && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                Filtered to{" "}
                {version?.definition.stages.find((s) => s.id === filters.stage)
                  ?.name ?? filters.stage}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ stage: "", page: "1" })}
              >
                Show all stages
              </Button>
            </div>
          )}
          {!data ? (
            !error && <BoardLoading label="Loading applications…" />
          ) : view === "kanban" && version ? (
            <div className="min-w-0 space-y-2">
              <p
                id="hiring-drag-help"
                className="text-xs text-muted-foreground"
              >
                Drag cards between stages or choose Move to. Hold near an edge
                to scroll; review each move before confirming.
              </p>
              <p role="status" aria-live="polite" className="sr-only">
                {draggingId
                  ? overStage && overStage !== draggingApp?.stageId
                    ? `Release to review a move to ${version.definition.stages.find((stage) => stage.id === overStage)?.name ?? "this stage"}.`
                    : "Dragging application. Hold near the board edges to scroll."
                  : recentMove
                    ? "Application moved. Destination brought into view."
                    : ""}
              </p>
              <div
                ref={board}
                aria-label="Hiring stages"
                aria-describedby="hiring-drag-help"
                aria-busy={loading}
                className="flex min-h-[26rem] gap-4 overflow-x-auto scroll-auto p-1 pb-4"
              >
                {version.definition.stages.map((stage) => {
                  const items = data.items.filter(
                    (a) => a.stageId === stage.id,
                  );
                  const isOver =
                    !!draggingId &&
                    overStage === stage.id &&
                    draggingApp?.stageId !== stage.id &&
                    draggingApp?.pipelineVersionId === version.id;
                  return (
                    <section
                      key={stage.id}
                      data-hiring-stage={stage.id}
                      data-drag-over={isOver || undefined}
                      aria-label={`${stage.name} stage`}
                      className={`w-72 min-w-72 flex-1 space-y-4 rounded-xl border border-t-4 p-3 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${stageTone[stage.color]} ${isOver ? "bg-primary/10 ring-2 ring-primary shadow-md" : "bg-muted/30"}`}
                      onDragOver={(e) => {
                        if (drag.current?.pipelineVersionId === version.id) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect =
                            drag.current.stageId === stage.id ? "none" : "move";
                          setOverStage(stage.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const app = drag.current;
                        endDrag();
                        if (
                          app &&
                          app.pipelineVersionId === version.id &&
                          app.stageId !== stage.id
                        )
                          setMove({ app, target: stage.id });
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 px-1 py-1">
                        <h2 className="min-w-0 break-words text-sm font-semibold">
                          {stage.name}
                        </h2>
                        <Badge
                          variant="secondary"
                          className="shrink-0 tabular-nums"
                        >
                          {data.stats[stage.id] ?? 0}
                        </Badge>
                      </div>
                      {draggingId && draggingApp?.stageId !== stage.id && (
                        <div
                          aria-hidden="true"
                          className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs transition-colors duration-200 motion-reduce:transition-none ${isOver ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                        >
                          <MoveRight className="size-4 shrink-0" />
                          {isOver
                            ? "Drop to review move"
                            : "Drag here to review a move"}
                        </div>
                      )}
                      {stage.description && (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {stage.description}
                        </p>
                      )}
                      {items.map((app) => (
                        <article
                          key={app.id}
                          data-application-id={app.id}
                          data-dragging={draggingId === app.id || undefined}
                          draggable={!app.hold}
                          onDragStart={(event) => {
                            if (
                              app.hold ||
                              (event.target as HTMLElement).closest(
                                "a, button, input, textarea, select, summary",
                              )
                            ) {
                              event.preventDefault();
                              return;
                            }
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", app.id);
                            drag.current = app;
                            dragPoint.current = {
                              x: event.clientX,
                              y: event.clientY,
                            };
                            setDraggingApp(app);
                            setOverStage(app.stageId);
                          }}
                          onDragEnd={endDrag}
                          className={`space-y-3 rounded-lg border bg-card p-4 shadow-xs transition-[opacity,box-shadow,background-color] duration-200 motion-reduce:transition-none ${!app.hold ? "cursor-grab active:cursor-grabbing" : ""} ${draggingId === app.id ? "opacity-40 ring-2 ring-primary/40" : ""} ${recentMove?.id === app.id && recentMove.stage === app.stageId ? "bg-primary/10 ring-2 ring-primary motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-300" : ""}`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              aria-hidden="true"
                              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                            >
                              {(app.name || "Unnamed candidate")
                                .trim()
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join("")
                                .toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1 space-y-1">
                              <Link
                                href={`/hiring/${app.id}`}
                                className="block break-words text-sm font-semibold hover:underline"
                              >
                                {app.name || "Unnamed candidate"}
                              </Link>
                              {app.email && (
                                <p className="break-words text-xs text-muted-foreground">
                                  {app.email}
                                </p>
                              )}
                            </div>
                            {!app.hold && (
                              <GripVertical
                                aria-hidden="true"
                                className="pointer-events-none mt-0.5 size-4 shrink-0 text-muted-foreground"
                              />
                            )}
                          </div>
                          <p className="break-words text-xs font-medium text-muted-foreground">
                            {app.jobTitle}
                          </p>
                          <div className="flex flex-wrap gap-2 empty:hidden">
                            {app.hold && (
                              <Badge variant="outline">On hold</Badge>
                            )}
                            {app.offer !== "none" && (
                              <Badge variant="secondary">
                                Offer {app.offer}
                              </Badge>
                            )}
                            {app.interviewId && (
                              <Badge variant="outline">Interview linked</Badge>
                            )}
                          </div>
                          {app.documentCounts &&
                            app.documentCounts.required > 0 && (
                              <Badge variant="outline">
                                {app.documentCounts.accepted}/
                                {app.documentCounts.required} documents accepted
                              </Badge>
                            )}
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock3
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            {stageAgeLabel(app.stageEnteredAt)}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                            <Button variant="outline" size="sm" asChild>
                              <Link
                                href={`/hiring/${app.id}?tab=${app.nextTask?.tab ?? "overview"}`}
                              >
                                {app.nextTask?.label ?? "Open application"}
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!!app.hold}
                              onClick={() => setMove({ app, target: "" })}
                            >
                              Move to…
                            </Button>
                            <ApplicationRemoval
                              app={app}
                              onChanged={() => void reload()}
                            />
                          </div>
                        </article>
                      ))}
                      {!items.length && (
                        <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                          <UsersRound
                            aria-hidden="true"
                            className="size-5 opacity-60"
                          />
                          <p className="text-xs">
                            {(data.stats[stage.id] ?? 0) > 0
                              ? "No applications on this page"
                              : "No applications yet"}
                          </p>
                        </div>
                      )}
                      {(data.stats[stage.id] ?? 0) > items.length && (
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() =>
                            setFilters({ stage: stage.id, page: "1" })
                          }
                        >
                          View all {data.stats[stage.id]} in this stage
                        </Button>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              aria-busy={loading}
              className="overflow-x-auto rounded-xl border"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Time in stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/hiring/${app.id}`}
                          className="hover:underline"
                        >
                          {app.name || "Unnamed candidate"}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {app.email}
                        </p>
                      </TableCell>
                      <TableCell>{app.jobTitle}</TableCell>
                      <TableCell>
                        {stageName(app)}
                        {app.documentCounts &&
                          app.documentCounts.required > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {app.documentCounts.accepted}/
                              {app.documentCounts.required} documents accepted
                            </p>
                          )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {stageAgeLabel(app.stageEnteredAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {applicationStatusLabel(app)}
                        </Badge>
                        {app.hold && (
                          <p className="mt-1 max-w-64 text-xs text-muted-foreground">
                            {app.hold}
                          </p>
                        )}
                        {app.nextAppointment && (
                          <p className="text-xs text-muted-foreground">
                            {applicationAppointmentLabel(
                              app.nextAppointment,
                              app.nextAppointmentTimezone,
                            )}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="link" asChild>
                            <Link
                              href={`/hiring/${app.id}?tab=${app.nextTask?.tab ?? "overview"}`}
                            >
                              {app.nextTask?.label ?? "Open"}
                            </Link>
                          </Button>
                          {app.nextTask?.description && (
                            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                              {app.nextTask.description}
                            </p>
                          )}
                          <ApplicationRemoval
                            app={app}
                            onChanged={() => void reload()}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!data.items.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center">
                        <p className="font-medium">
                          No applications match this view
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Try another work view or adjust your filters.
                        </p>
                        {hasFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={clearFilters}
                          >
                            Clear filters
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {data && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
              <span>
                {data.total > 0
                  ? `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} of ${data.total}`
                  : "No applications"}
                {view === "kanban" && " · Stage counts include all matches"}
              </span>
              {data.total > data.pageSize && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={data.page <= 1 || loading}
                    onClick={() => setFilters({ page: String(data.page - 1) })}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      data.page * data.pageSize >= data.total || loading
                    }
                    onClick={() => setFilters({ page: String(data.page + 1) })}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {adding && config && (
        <AddApplication
          config={config}
          versionId={versionId}
          initialJob={filters.job}
          close={() => setAdding(false)}
          onDone={reload}
        />
      )}
      {move && config && (
        <MoveApplication
          app={move.app}
          initialTarget={move.target}
          config={config}
          close={() => setMove(null)}
          onDone={async (stage) => {
            await reload();
            setRecentMove({ id: move.app.id, stage });
          }}
        />
      )}
    </AppShell>
  );
}
function ApplicationRemoval({
  app,
  onChanged,
}: {
  app: HiringApplication;
  onChanged: () => void;
}) {
  const label = `${app.name || "Unnamed candidate"} — ${app.jobTitle}`;
  return (
    <details className="group w-full">
      <summary
        className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
        aria-label={`More actions for ${app.name || "Unnamed candidate"}`}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" /> More actions
      </summary>
      <div className="mt-2 flex flex-wrap gap-2 rounded-lg bg-muted/50 p-2">
        <ArchiveButton
          type="hiring_application"
          id={app.id}
          label={label}
          onArchived={onChanged}
        />
        <DeleteButton
          type="hiring_application"
          id={app.id}
          label={label}
          onDeleted={onChanged}
        />
      </div>
    </details>
  );
}

function BoardLoading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function MoveApplication({
  app,
  initialTarget,
  config,
  close,
  onDone,
}: {
  app: HiringApplication;
  initialTarget: string;
  config: HiringConfiguration;
  close: () => void;
  onDone: (stage: string) => Promise<unknown>;
}) {
  const [target, setTarget] = useState(initialTarget),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const stages =
    config.versions.find((v) => v.id === app.pipelineVersionId)?.definition
      .stages ?? [];
  const currentStage = stages.find((stage) => stage.id === app.stageId);
  const destination = stages.find((stage) => stage.id === target);
  const backward =
    !!destination &&
    stages.indexOf(destination) <
      stages.findIndex((stage) => stage.id === app.stageId);
  const reasonMissing = backward && reason.trim().length < 3;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/hiring/applications/${app.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "move",
          stageId: target,
          reason,
          expectedRevision: app.revision,
          mutationId: crypto.randomUUID(),
        }),
      });
      await onDone(target);
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Move {app.name}</DialogTitle>
          <DialogDescription>
            {app.jobTitle}. Stage requirements are checked before moving.
            Existing approvals, forms and interviews remain recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="rounded-lg bg-muted p-3 text-sm">
            <span className="text-muted-foreground">Current stage: </span>
            {currentStage?.name ?? "Stage unavailable"}
            {destination && (
              <>
                <span className="mx-2" aria-hidden="true">
                  →
                </span>
                {destination.name}
              </>
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="move-stage">Destination</Label>
            <SelectField
              id="move-stage"
              className="w-full"
              disabled={busy}
              value={target}
              onValueChange={setTarget}
              placeholder="Choose stage"
            >
              {stages
                .filter((s) => s.id !== app.stageId)
                .map((s) => (
                  <SelectFieldOption key={s.id} value={s.id}>
                    {s.name}
                  </SelectFieldOption>
                ))}
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-reason">
              {backward ? "Reason for moving back" : "Reason (optional)"}
            </Label>
            <Textarea
              id="move-reason"
              required={backward}
              aria-describedby="move-reason-help"
              disabled={busy}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p id="move-reason-help" className="text-xs text-muted-foreground">
              {backward
                ? "This moves the application to an earlier stage. Enter at least 3 characters to explain why."
                : "Add context for the application's activity history."}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={busy || !destination || reasonMissing}
            onClick={() => void save()}
          >
            {busy ? "Moving…" : "Move application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function AddApplication({
  config,
  versionId,
  initialJob,
  close,
  onDone,
}: {
  config: HiringConfiguration;
  versionId: string;
  initialJob: string;
  close: () => void;
  onDone: () => Promise<unknown>;
}) {
  const [search, setSearch] = useState(""),
    [cvs, setCvs] = useState<
      {
        candidateId: string;
        resumeId: string;
        name: string;
        email: string;
        fileName: string;
      }[]
    >([]),
    [cvId, setCvId] = useState(""),
    [job, setJob] = useState(
      () =>
        config.jobs.find(
          (job) =>
            job.id === initialJob &&
            !job.archived &&
            config.versions.some(
              (version) =>
                version.id === job.pipelineVersionId && !version.archived,
            ),
        )?.id ?? "",
    ),
    [pipeline, setPipeline] = useState(
      () =>
        config.versions.find(
          (version) => version.id === versionId && !version.archived,
        )?.id ??
        config.versions.find((version) => !version.archived)?.id ??
        "",
    ),
    [loadedSearch, setLoadedSearch] = useState<string | null>(null),
    [searchAttempt, setSearchAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const searching = loadedSearch !== search;
  const selectedCv = cvs.find((cv) => cv.resumeId === cvId);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void workflowApi<{ items: typeof cvs }>(
        `/api/hiring/candidates?search=${encodeURIComponent(search)}`,
      )
        .then((data) => {
          if (alive) {
            setCvs(data.items);
            setError("");
            setLoadedSearch(search);
          }
        })
        .catch((e) => {
          if (alive) {
            setCvs([]);
            setError(errorText(e));
            setLoadedSearch(search);
          }
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, searchAttempt]);
  async function save() {
    const cv = selectedCv;
    if (!cv || searching || busy) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi("/api/hiring/applications", {
        method: "POST",
        body: JSON.stringify({
          candidateId: cv.candidateId,
          resumeId: cv.resumeId,
          jobId: job || undefined,
          pipelineVersionId: pipeline || undefined,
          mutationId: requestId.current,
        }),
      });
      await onDone();
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add job application</DialogTitle>
          <DialogDescription>
            Choose the candidate&apos;s CV and job. Applying to another job
            creates an independent application. Adding it may start the
            pipeline&apos;s configured automation.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="application-search">Find candidate or CV</Label>
            <Input
              id="application-search"
              maxLength={200}
              placeholder="Name, email or CV filename"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCvId("");
                setCvs([]);
                setLoadedSearch(null);
                setError("");
                requestId.current = crypto.randomUUID();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="application-cv">Candidate and CV</Label>
            <SelectField
              id="application-cv"
              className="w-full"
              disabled={busy || searching || !cvs.length}
              aria-describedby="application-cv-help"
              value={cvId}
              onValueChange={(v) => {
                setCvId(v);
                requestId.current = crypto.randomUUID();
              }}
              placeholder="Choose a candidate CV"
            >
              {cvs.map((c) => (
                <SelectFieldOption key={c.resumeId} value={c.resumeId}>
                  {c.name} · {c.fileName}
                </SelectFieldOption>
              ))}
            </SelectField>
            <p
              id="application-cv-help"
              role="status"
              className="text-xs leading-5 text-muted-foreground"
            >
              {searching
                ? "Searching candidates…"
                : !cvs.length
                  ? error
                    ? "Candidate search failed. Try again below."
                    : "No candidates found. Try another name, email or CV filename."
                  : `${cvs.length === 100 ? "First 100" : cvs.length} available CV${cvs.length === 1 ? "" : "s"}. ${cvs.length === 100 ? "Refine your search to find more candidates." : "Choose the CV for this application."}`}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="application-job">Job opening</Label>
            <SelectField
              id="application-job"
              className="w-full"
              value={job}
              placeholder="Assign a job later"
              onValueChange={(v) => {
                setJob(v);
                requestId.current = crypto.randomUUID();
              }}
            >
              <SelectFieldOption value="">Assign a job later</SelectFieldOption>
              {config.jobs
                .filter(
                  (j) =>
                    !j.archived &&
                    config.versions.some(
                      (version) =>
                        version.id === j.pipelineVersionId && !version.archived,
                    ),
                )
                .map((j) => (
                  <SelectFieldOption key={j.id} value={j.id}>
                    {j.title}
                  </SelectFieldOption>
                ))}
            </SelectField>
          </div>
          {!job && (
            <div className="space-y-2">
              <Label htmlFor="application-pipeline">Pipeline</Label>
              <SelectField
                id="application-pipeline"
                className="w-full"
                value={pipeline}
                onValueChange={(v) => {
                  setPipeline(v);
                  requestId.current = crypto.randomUUID();
                }}
                placeholder="Choose published pipeline"
              >
                {config.versions
                  .filter((v) => !v.archived)
                  .map((v) => (
                    <SelectFieldOption key={v.id} value={v.id}>
                      {v.name}
                    </SelectFieldOption>
                  ))}
              </SelectField>
            </div>
          )}
          {selectedCv && (
            <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium break-words">
                {selectedCv.name || "Unnamed candidate"}
              </p>
              <p className="break-words text-xs text-muted-foreground">
                {selectedCv.email} · {selectedCv.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.jobs.find((item) => item.id === job)?.title ??
                  "Job will be assigned later"}{" "}
                ·{" "}
                {
                  config.versions.find(
                    (item) =>
                      item.id ===
                      (config.jobs.find((item) => item.id === job)
                        ?.pipelineVersionId ?? pipeline),
                  )?.name
                }
              </p>
            </div>
          )}
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
              {!selectedCv && (
                <Button
                  variant="link"
                  onClick={() => {
                    setLoadedSearch(null);
                    setError("");
                    setSearchAttempt((attempt) => attempt + 1);
                  }}
                >
                  Retry candidate search
                </Button>
              )}
            </div>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={busy || searching || !selectedCv || (!job && !pipeline)}
            onClick={() => void save()}
          >
            {busy ? "Adding…" : "Add application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
