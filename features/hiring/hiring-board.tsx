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
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
};
const valid = (key: keyof typeof defaults, value: string) =>
  key === "view"
    ? ["kanban", "list"].includes(value)
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
  const versionId = resolvePipelineReference(config ?? {},
    filters.pipeline === "all"
      ? ""
      : filters.pipeline ||
        config?.pipelines.find((p) => p.isDefault)?.currentVersionId ||
        config?.versions.find((v) => !v.archived)?.id ||
        "");
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
  return (
    <AppShell displayName={displayName} fullWidth={view === "kanban"}>
      <PageHeader
        title="Hiring pipeline"
        description="Follow each job application from intake to hiring. Move candidates through your company's stages and review preparation and interviews together."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/hiring/legacy">Legacy records</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/hiring/pipelines">Manage pipelines & jobs</Link>
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
        <p role="status">Loading hiring models…</p>
      ) : !config.versions.length ? (
        <div className="space-y-4 rounded-xl border border-dashed p-8">
          <h2 className="text-lg font-semibold">
            Create your first hiring model
          </h2>
          <p className="text-sm text-muted-foreground">
            Publish a pipeline, create a job opening, then add applications.
            Existing candidate preparation stays available.
          </p>
          <Button asChild>
            <Link href="/hiring/pipelines">Configure hiring pipeline</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="hiring-work-view">Work view</Label>
            <SelectField
              id="hiring-work-view"
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
              <SelectFieldOption value="pipeline">Pipeline</SelectFieldOption>
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
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 space-y-2">
              <Label htmlFor="board-pipeline">Pipeline</Label>
              <SelectField
                id="board-pipeline"
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
            <div className="min-w-44 space-y-2">
              <Label htmlFor="board-job">Job opening</Label>
              <SelectField
                id="board-job"
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
            <div className="min-w-44 flex-1 space-y-2">
              <Label htmlFor="board-search">Search applications</Label>
              <Input
                id="board-search"
                placeholder="Name, email or job"
                maxLength={200}
                value={filters.search}
                onChange={(e) =>
                  setFilters({ search: e.target.value, page: "1" })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-status">Status</Label>
              <SelectField
                id="board-status"
                value={filters.closed}
                onValueChange={(closed) => setFilters({ closed, page: "1" })}
              >
                <SelectFieldOption value="false">Active</SelectFieldOption>
                <SelectFieldOption value="true">Closed</SelectFieldOption>
              </SelectField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={view === "kanban" ? "secondary" : "outline"}
                disabled={!version || filters.closed === "true"}
                onClick={() => setFilters({ view: "kanban" })}
              >
                <Columns3 />
                Board
              </Button>
              <Button
                variant={view === "list" ? "secondary" : "outline"}
                onClick={() => setFilters({ view: "list" })}
              >
                <List />
                List
              </Button>
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
            <p role="status">Loading applications…</p>
          ) : view === "kanban" && version ? (
            <div className="min-w-0 space-y-2">
              <p
                id="hiring-drag-help"
                className="text-xs text-muted-foreground"
              >
                Drag a card to another stage, or use Move to. Hold near the
                board edges to scroll. Dropping opens a review before moving.
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
                className="flex min-h-80 gap-4 overflow-x-auto scroll-auto p-1 pb-4"
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
                      className={`w-80 shrink-0 space-y-4 rounded-xl border border-t-4 p-4 transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${stageTone[stage.color]} ${isOver ? "bg-primary/10 ring-2 ring-primary shadow-md" : "bg-muted/30"}`}
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
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="font-semibold">{stage.name}</h2>
                        <Badge variant="secondary">
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
                                "a, button, input, textarea, select",
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
                          <div className="flex items-start gap-2">
                            {!app.hold && (
                              <GripVertical
                                aria-hidden="true"
                                className="pointer-events-none mt-0.5 size-4 shrink-0 text-muted-foreground"
                              />
                            )}
                            <Link
                              href={`/hiring/${app.id}`}
                              className="block font-semibold hover:underline"
                            >
                              {app.name || "Unnamed candidate"}
                            </Link>
                          </div>
                          <p className="break-words text-xs text-muted-foreground">
                            {app.email}
                            <br />
                            {app.jobTitle}
                          </p>
                          <div className="flex flex-wrap gap-2">
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
                          <p className="text-xs text-muted-foreground">
                            {app.stageEnteredAt
                              ? `${Math.max(0, Math.floor((Date.now() - Date.parse(app.stageEnteredAt)) / 86400000))} days in stage`
                              : "Stage start unknown"}
                          </p>
                          <div className="flex flex-wrap gap-2">
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
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          No applications on this page.
                        </p>
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
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Application</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">
                        {app.name}
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
                      <TableCell>
                        {app.outcome ?? (app.hold ? "On hold" : "Active")}
                        {app.nextAppointment && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(app.nextAppointment).toLocaleString(
                              undefined,
                              {
                                timeZone:
                                  app.nextAppointmentTimezone ?? undefined,
                              },
                            )}{" "}
                            ({app.nextAppointmentTimezone ?? "local time"})
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
                      <TableCell colSpan={5} className="py-8 text-center">
                        No applications match these filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {data && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {data.total} applications · Page {data.page} · Up to 50 per
                page. Column counts cover all matches.
              </span>
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
                  disabled={data.page * 50 >= data.total || loading}
                  onClick={() => setFilters({ page: String(data.page + 1) })}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          <LegacyImport onDone={reload} />
        </>
      )}
      {adding && config && (
        <AddApplication
          config={config}
          versionId={versionId}
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
    <>
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
    </>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {app.name}</DialogTitle>
          <DialogDescription>
            {app.jobTitle}. Stage requirements are checked before moving.
            Existing approvals, forms and interviews remain recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="move-stage">Destination</Label>
            <SelectField
              id="move-stage"
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
              Reason · required for a backward move
            </Label>
            <Input
              id="move-reason"
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
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
          <Button disabled={busy || !target} onClick={() => void save()}>
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
  close,
  onDone,
}: {
  config: HiringConfiguration;
  versionId: string;
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
    [job, setJob] = useState(""),
    [pipeline, setPipeline] = useState(versionId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef(crypto.randomUUID());
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void workflowApi<{ items: typeof cvs }>(
        `/api/hiring/candidates?search=${encodeURIComponent(search)}`,
      )
        .then((data) => {
          if (alive) setCvs(data.items);
        })
        .catch((e) => {
          if (alive) setError(errorText(e));
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search]);
  async function save() {
    const cv = cvs.find((c) => c.resumeId === cvId);
    if (!cv) return;
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add job application</DialogTitle>
          <DialogDescription>
            Choose the candidate&apos;s CV and job. Applying to another job
            creates an independent application.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="application-search">Find candidate or CV</Label>
            <Input
              id="application-search"
              maxLength={200}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCvId("");
                requestId.current = crypto.randomUUID();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="application-cv">Candidate and CV</Label>
            <SelectField
              id="application-cv"
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="application-job">Job opening</Label>
            <SelectField
              id="application-job"
              value={job}
              placeholder="Assign a job later"
              onValueChange={(v) => {
                setJob(v);
                requestId.current = crypto.randomUUID();
              }}
            >
              <SelectFieldOption value="">Assign a job later</SelectFieldOption>
              {config.jobs
                .filter((j) => !j.archived)
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
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={busy || !cvId || (!job && !pipeline)}
            onClick={() => void save()}
          >
            {busy ? "Adding…" : "Add application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function LegacyImport({ onDone }: { onDone: () => Promise<unknown> }) {
  const [preview, setPreview] = useState<{
      items: {
        candidateId: string;
        name: string;
        stage: string;
        expectedRevision: string;
      }[];
      total: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setPreview(await workflowApi("/api/hiring/import"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await workflowApi<{ imported: number }>(
        "/api/hiring/import",
        {
          method: "POST",
          body: JSON.stringify({ items: preview.items.slice(0, 20) }),
        },
      );
      setNotice(
        `${result.imported} applications imported. Existing evidence was retained; no automation was started.`,
      );
      setPreview(await workflowApi("/api/hiring/import"));
      await onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Bring existing candidate preparation onto the hiring board
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Preview a legacy pipeline that retains the current preparation stages
          and interview links. Importing does not send invitations or start
          workflows.
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          Preview existing candidates
        </Button>
        {preview && (
          <>
            <ul className="max-h-52 space-y-2 overflow-y-auto text-sm">
              {preview.items.slice(0, 20).map((p) => (
                <li key={p.candidateId}>
                  {p.name} · {p.stage}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {preview.items.length
                ? `Showing up to 20 pending imports from ${preview.total} candidate preparations.`
                : "No pending active candidates to import."}
            </p>
            <Button
              disabled={busy || !preview.items.length}
              onClick={() => void apply()}
            >
              Import displayed candidates
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
