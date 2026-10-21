"use client";
import {
  statusColor,
  runStatusLabel,
} from "@/features/candidate-progress/presentation";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { executionGuidance } from "./execution-guidance";
import { ArchiveButton } from "@/features/archive/archive-button";
import { RunTelegramAction } from "@/features/telegram/run-telegram-action";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Clock3,
  RefreshCw,
  XCircle,
  LoaderCircle,
  Activity,
  Search,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { X } from "lucide-react";
import { displayNode } from "./workspace-tools";
import { ExecutionCanvas } from "./execution-canvas";
import { workflowApi, errorText, runDate } from "./client";
import { STEP_LABELS, type WorkflowRun, type RunStatus } from "./workflow";

const STATUS_LABELS: Record<RunStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_review: "Waiting for action",
  completed: "Completed",
  rejected: "Rejected",
  failed: "Failed",
};
export function RunBadge({
  status,
  waitingFor,
}: {
  status: RunStatus;
  waitingFor?: string;
}) {
  const label = runStatusLabel(status, waitingFor);
  return (
    <Badge variant="outline" className={statusColor(label)}>
      {label}
    </Badge>
  );
}
type RunsData = {
  items: WorkflowRun[];
  total: number;
  page: number;
  stats: Partial<Record<RunStatus, number>>;
};

const RUN_FILTERS = {
  executionSearch: "",
  executionStatus: "all",
  executionDays: "7",
};
function validRunFilter(key: keyof typeof RUN_FILTERS, value: string) {
  return key === "executionSearch"
    ? value.length <= 120
    : key === "executionStatus"
      ? value === "all" || Object.hasOwn(STATUS_LABELS, value)
      : ["1", "7", "30", "all"].includes(value);
}
export function WorkflowRunsView({
  workflowId,
  preferenceKey,
}: {
  workflowId?: string;
  preferenceKey: string;
}) {
  const [data, setData] = useState<RunsData | null>(null);
  const {
    filters,
    setFilters,
    ready: filtersReady,
  } = useUrlFilters(RUN_FILTERS, validRunFilter, preferenceKey);
  const search = filters.executionSearch,
    status = filters.executionStatus,
    days = filters.executionDays;
  const setSearch = (value: string) => setFilters({ executionSearch: value });
  const setStatus = (value: string) => setFilters({ executionStatus: value });
  const setDays = (value: string) => setFilters({ executionDays: value });
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setCompact(media.matches);
    queueMicrotask(update);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [selected, setSelected] = useState<WorkflowRun | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!filtersReady) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), search, days });
      if (workflowId) query.set("workflowId", workflowId);
      if (status !== "all") query.set("status", status);
      const result = await workflowApi<RunsData>(`/api/workflow-runs?${query}`);
      if (id === requestId.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (id === requestId.current) setError(errorText(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [workflowId, page, search, status, days, filtersReady]);
  const invalidateRequests = useCallback(() => {
    ++requestId.current;
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    const interval = window.setInterval(() => void load(), 10000);
    return () => {
      invalidateRequests();
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [load, invalidateRequests]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("run");
    if (!id) return;
    const controller = new AbortController();
    void workflowApi<{ run: WorkflowRun }>(`/api/workflow-runs/${id}`, {
      signal: controller.signal,
    })
      .then((d) => {
        if (!controller.signal.aborted) setSelected(d.run);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, []);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void workflowApi<{ run: WorkflowRun }>(
        `/api/workflow-runs/${selectedId}`,
        { signal: controller.signal },
      )
        .then((d) => {
          if (!controller.signal.aborted) setSelected(d.run);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        });
    }, 10000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [selectedId]);
  async function act(action: "retry" | "return_review") {
    if (!selected) return;
    setBusy(true);
    try {
      const d = await workflowApi<{ run: WorkflowRun }>(
        `/api/workflow-runs/${selected.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            expectedUpdatedAt: selected.updatedAt,
          }),
        },
      );
      setSelected(d.run);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const total = Object.values(data?.stats ?? {}).reduce(
    (a, b) => a + (b ?? 0),
    0,
  );
  const executionDetails = selected ? (
    <div className="space-y-6 p-5">
      <RunBadge
        status={selected.status}
        waitingFor={selected.context.waitingFor}
      />
      <div>
        <h3 className="break-words font-semibold">
          {selected.candidateName || selected.fileName}
        </h3>
        <p className="mt-1 text-sm font-medium">
          {executionGuidance(selected).title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {executionGuidance(selected).action}
        </p>
      </div>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm">
          More execution actions
        </summary>
        <p className="my-3 break-all text-xs text-muted-foreground">
          Run ID: {selected.id}
        </p>
        <ArchiveButton
          type="workflow_run"
          id={selected.id}
          label="this workflow run"
          onArchived={() => {
            setSelected(null);
            void load();
          }}
        />
      </details>
      <ExecutionCanvas run={selected} />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Step timeline
        </summary>
        <ol className="mt-4 space-y-5">
          {selected.graph.nodes
            .filter((n) => n.kind !== "stop" || selected.context.steps[n.id])
            .map((n) => {
              const result = selected.context.steps[n.id];
              const Icon =
                result?.status === "completed"
                  ? CheckCircle2
                  : result?.status === "failed"
                    ? XCircle
                    : selected.currentNodeId === n.id
                      ? Clock3
                      : Circle;
              return (
                <li key={n.id} className="flex gap-3">
                  <Icon
                    className={`mt-0.5 size-5 shrink-0 ${result?.status === "completed" ? "text-emerald-600" : result?.status === "failed" ? "text-red-600" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p className="text-sm font-medium">{displayNode(n)}</p>
                    <p className="text-xs text-muted-foreground">
                      {result?.note ??
                        (result?.status === "completed"
                          ? "Completed"
                          : selected.currentNodeId === n.id
                            ? STATUS_LABELS[selected.status]
                            : "Not reached")}
                    </p>
                    {result?.completedAt && (
                      <p className="text-xs text-muted-foreground">
                        {runDate(result.completedAt)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ol>
      </details>
      {selected.context.reviewer && (
        <div className="rounded-lg border p-3 text-sm">
          <p>Reviewed by {selected.context.reviewer}</p>
          {selected.context.reviewNote && (
            <p className="mt-2 text-muted-foreground">
              {selected.context.reviewNote}
            </p>
          )}
        </div>
      )}
      {selected.status === "failed" && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p>
              {selected.graph.nodes.find((n) => n.id === selected.currentNodeId)
                ?.kind === "send_telegram"
                ? "Check the Telegram contact and delivery result below. If delivery is uncertain, check with the candidate before resending."
                : selected.graph.nodes.find(
                      (n) => n.id === selected.currentNodeId,
                    )?.kind === "create_account"
                  ? "Check the reviewed email and any existing account before retrying. Account reuse requires explicit confirmation."
                  : selected.graph.nodes.find(
                        (n) => n.id === selected.currentNodeId,
                      )?.kind === "assign_forms"
                    ? "Check the published template versions and roles in this workflow. After fixing the requirement, retry the failed step; completed assignments are preserved."
                    : "Check the error below and the selected CV. Fix the requirement, then retry the failed step; completed steps are preserved."}
            </p>
            {selected.graph.nodes.find((n) => n.id === selected.currentNodeId)
              ?.kind === "create_account" && (
              <Link className="underline" href="/accounts">
                Review accounts
              </Link>
            )}
            {selected.graph.nodes.find((n) => n.id === selected.currentNodeId)
              ?.kind === "assign_forms" && (
              <Link className="underline" href="/forms">
                Review published templates
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}
      {selected.errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{selected.errorMessage}</AlertDescription>
        </Alert>
      )}
      {selected.graph.nodes.some((n) => n.kind === "send_telegram") &&
        (selected.context.waitingFor ||
          selected.status === "completed" ||
          (selected.status === "failed" &&
            selected.graph.nodes.find((n) => n.id === selected.currentNodeId)
              ?.kind === "send_telegram")) && (
          <RunTelegramAction
            key={selected.id}
            run={selected}
            onUpdated={(r) => {
              setSelected(r);
              void load();
            }}
          />
        )}
      {selected.status === "failed" && (
        <div className="space-y-3">
          <Button disabled={busy} onClick={() => void act("retry")}>
            {busy && <LoaderCircle className="animate-spin" />} Retry failed
            step
          </Button>
          {selected.graph.nodes.find((n) => n.id === selected.currentNodeId)
            ?.kind === "create_account" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void act("return_review")}
            >
              Return to review
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Completed steps are preserved. Existing assignments are not
            duplicated.
          </p>
        </div>
      )}
      {selected.status === "waiting_review" &&
        selected.graph.nodes.find((n) => n.id === selected.currentNodeId)
          ?.kind === "review_resume" && (
          <Button asChild>
            <Link href={`/workflows/runs/${selected.id}/review`}>
              Review CV
            </Link>
          </Button>
        )}
      <div className="flex flex-wrap gap-2">
        {selected.context.applicationEvent?.applicationId && (
          <Button asChild variant="outline">
            <Link href={`/hiring/${selected.context.applicationEvent.applicationId}`}>
              Open application
            </Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/resumes/${selected.resumeId}`}>Open resume</Link>
        </Button>
      </div>
      {selected.context.userId && (
        <Button asChild variant="outline">
          <Link href="/accounts">View accounts</Link>
        </Button>
      )}
    </div>
  ) : null;
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Execution overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track workflow progress and open a run to see its path and next action.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Execution totals">
        {[
          { label: "Total runs", value: total, icon: Activity, color: "text-muted-foreground" },
          { label: "Waiting for action", value: data?.stats.waiting_review ?? 0, icon: Clock3, color: "text-amber-600 dark:text-amber-400" },
          { label: "Completed", value: data?.stats.completed ?? 0, icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Failed", value: data?.stats.failed ?? 0, icon: XCircle, color: "text-red-600 dark:text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="gap-0 py-0 shadow-none">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted-foreground">{label}</p>
                <Icon className={`size-4 shrink-0 ${color}`} aria-hidden="true" />
              </div>
              <p className="text-2xl font-semibold tabular-nums">{data ? value : "—"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div
        className={
          selected && !compact
            ? "grid min-w-0 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]"
            : "min-w-0"
        }
      >
        <Card className="min-w-0 gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Workflow runs</h2>
                <span className="text-xs text-muted-foreground" role="status">
                  {loading ? "Updating…" : data ? `${data.total} matching runs` : "Loading executions…"}
                </span>
              </div>
              <div
                className={
                  selected && !compact
                    ? "grid min-w-0 gap-2"
                    : "grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]"
                }
              >
                <Input
                  className="min-w-0 w-full sm:col-span-2 xl:col-span-1"
                  placeholder="Search candidate or resume"
                  aria-label="Search runs"
                  disabled={!filtersReady}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                <Select
                  disabled={!filtersReady}
                  value={status}
                  onValueChange={(v) => {
                    setStatus(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className={selected && !compact ? "w-full min-w-0" : "w-full min-w-0 xl:w-44"}
                    aria-label="Run status"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([s, label]) => (
                      <SelectItem key={s} value={s}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  disabled={!filtersReady}
                  value={days}
                  onValueChange={(v) => {
                    setDays(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className={selected && !compact ? "w-full min-w-0" : "w-full min-w-0 xl:w-36"}
                    aria-label="Date range"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  aria-label="Refresh runs"
                  disabled={loading}
                  onClick={() => void load()}
                >
                  <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
                </Button>
                <Button
                  variant="ghost"
                  disabled={!filtersReady}
                  onClick={() => {
                    setFilters(RUN_FILTERS);
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto border-t" aria-busy={loading}>
              {!data?.items.length ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 py-10 text-center" role="status">
                  {loading || !filtersReady ? <LoaderCircle className="size-8 animate-spin text-muted-foreground" /> : <Search className="size-8 text-muted-foreground" />}
                  <div className="max-w-md space-y-2">
                    <h3 className="font-medium">
                      {loading || !filtersReady ? "Loading executions…" : error ? "Executions could not be loaded" : "No executions match these filters"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {loading || !filtersReady ? "Fetching workflow progress and recent runs." : error ? "Try refreshing to load the latest workflow progress." : "Try a wider date range or clear the filters. New runs appear here when a published workflow’s starting event occurs."}
                    </p>
                  </div>
                  {!loading && filtersReady && !error && (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="outline" onClick={() => { setFilters({ ...RUN_FILTERS, executionDays: "all" }); setPage(1); }}>
                        Show all executions
                      </Button>
                      <Button variant="ghost" asChild>
                        <Link href="/workflows/new"><Workflow /> Set up a workflow</Link>
                      </Button>
                    </div>
                  )}
                </div>
              ) : selected && !compact ? (
                <div className="max-h-[65svh] space-y-2 overflow-y-auto p-3">
                  {data?.items.map((r) => (
                    <Button
                      key={r.id}
                      aria-label={`Inspect execution for ${r.candidateName}`}
                      variant={r.id === selected.id ? "secondary" : "outline"}
                      className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                      onClick={() => setSelected(r)}
                    >
                      <span className="min-w-0 space-y-2">
                        <span className="block font-medium">
                          {r.candidateName}
                        </span>
                        <span
                          className="block truncate text-xs"
                          title={r.fileName}
                        >
                          {r.fileName}
                        </span>
                        <RunBadge
                          status={r.status}
                          waitingFor={r.context.waitingFor}
                        />
                        <span className="block text-xs text-muted-foreground">
                          {executionGuidance(r).title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {runDate(r.createdAt)} · v{r.version}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate / Resume</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Current step</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="min-w-48">
                          <p className="max-w-64 truncate font-medium" title={r.candidateName}>{r.candidateName || "Candidate"}</p>
                          <p className="max-w-60 truncate text-xs text-muted-foreground" title={r.fileName}>
                            {r.fileName}
                          </p>
                          {!workflowId && (
                            <p className="text-xs text-muted-foreground">
                              {r.workflowName}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <RunBadge
                            status={r.status}
                            waitingFor={r.context.waitingFor}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {executionGuidance(r).title}
                          </p>
                        </TableCell>
                        <TableCell>
                          {
                            STEP_LABELS[
                              r.graph.nodes.find(
                                (n) => n.id === r.currentNodeId,
                              )?.kind ?? "complete"
                            ]
                          }
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {runDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            {r.status === "waiting_review" &&
                              r.graph.nodes.find(
                                (n) => n.id === r.currentNodeId,
                              )?.kind === "review_resume" && (
                                <Button asChild size="sm">
                                  <Link href={`/workflows/runs/${r.id}/review`}>
                                    Review CV
                                  </Link>
                                </Button>
                              )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelected(r)}
                            >
                              View run
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
              <span className="text-muted-foreground">
                {data?.total ?? 0} runs · Page {page}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * 20 >= (data?.total ?? 0) || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {selected && !compact && (
          <aside
            className="min-w-0 rounded-xl border bg-card"
            aria-label="Execution workspace"
          >
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="font-semibold">Execution details</h2>
                <p className="break-all text-sm text-muted-foreground">
                  {selected.candidateName} · {selected.fileName} · v
                  {selected.version}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Close execution details"
                onClick={() => setSelected(null)}
              >
                <X />
              </Button>
            </div>
            {executionDetails}
          </aside>
        )}
      </div>
      <Sheet
        open={compact && !!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Execution details</SheetTitle>
            <SheetDescription>
              {selected?.candidateName} · Version {selected?.version}
            </SheetDescription>
          </SheetHeader>
          {compact && executionDetails}
        </SheetContent>
      </Sheet>
    </div>
  );
}
