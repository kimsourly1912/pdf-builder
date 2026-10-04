"use client";
import { SelectField, SelectFieldOption } from "@/components/patterns/select-field";
import { WORKFLOW_PRESETS, type WorkflowPreset } from "./presets";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Workflow, LoaderCircle, Copy } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { RunBadge } from "./workflow-runs";
import { WorkflowRunsView } from "./workflow-runs";
import { workflowApi, errorText, runDate } from "./client";
import {
  TRIGGER_LABELS,
  type WorkflowTrigger,
  type WorkflowSummary,
} from "./workflow";
import { ArchiveButton } from "@/features/archive/archive-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const FILTERS = {
  workflowSearch: "",
  workflowStatus: "all",
  workflowTrigger: "all",
};
function validFilter(key: keyof typeof FILTERS, value: string) {
  return key === "workflowStatus"
    ? ["all", "active", "paused", "draft"].includes(value)
    : key === "workflowTrigger"
      ? value === "all" || Object.hasOwn(TRIGGER_LABELS, value)
      : value.length <= 120;
}
export function WorkflowList(props: {
  displayName: string;
  preferenceKey: string;
}) {
  const {
    filters,
    setFilters,
    ready: filtersReady,
  } = useUrlFilters(FILTERS, validFilter, props.preferenceKey);
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "runs"
      ? "runs"
      : "workflows",
  );
  const [copying, setCopying] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false),
    [preset, setPreset] = useState<WorkflowPreset | "custom">("approval"),
    [trigger, setTrigger] = useState<WorkflowTrigger>("resume_verified");
  const [items, setItems] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const data = await workflowApi<{ items: WorkflowSummary[] }>(
        "/api/workflows",
      );
      setItems(data.items);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const data = await workflowApi<{ workflow: WorkflowSummary }>(
        "/api/workflows",
        {
          method: "POST",
          body: JSON.stringify(preset === "custom" ? { trigger } : { preset }),
        },
      );
      window.location.assign(`/workflows/${data.workflow.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  const visible = items.filter(
    (w) =>
      w.name.toLowerCase().includes(filters.workflowSearch.toLowerCase()) &&
      (filters.workflowTrigger === "all" ||
        w.trigger === filters.workflowTrigger) &&
      (filters.workflowStatus === "all" ||
        filters.workflowStatus ===
          (w.active ? "active" : w.version ? "paused" : "draft")),
  );
  async function duplicate(id: string) {
    if (copying) return;
    setCopying(id);
    setError("");
    try {
      const d = await workflowApi<{ workflow: WorkflowSummary }>(
        `/api/workflows/${id}`,
        { method: "POST", body: JSON.stringify({ action: "duplicate" }) },
      );
      window.location.assign(`/workflows/${d.workflow.id}`);
    } catch (e) {
      setError(errorText(e));
      setCopying(null);
    }
  }
  return (
    <AppShell displayName={props.displayName} fullWidth={tab === "runs"}>
      <PageHeader
        title="Automation"
        description="Configure when candidate preparation starts and what happens next. Daily review and form work stays in the candidate profile."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/workflows/new">
                <Plus /> New workflow
              </Link>
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCreateOpen(true)}
            >
              Advanced canvas setup
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
        <p>
          Looking for today’s HR work? Start with candidate actions. Use
          automation to configure preparation or investigate an execution.
        </p>
        <Button asChild variant="outline">
          <Link href="/needs-attention?responsibility=hr">Your HR actions</Link>
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="runs">Executions</TabsTrigger>
        </TabsList>
        <TabsContent value="workflows" className="mt-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search workflows"
              disabled={!filtersReady}
              placeholder="Search workflows…"
              className="min-w-0 flex-1"
              value={filters.workflowSearch}
              onChange={(e) => setFilters({ workflowSearch: e.target.value })}
            />
            <SelectField
              aria-label="Workflow status filter"
              disabled={!filtersReady}
              className="h-10 rounded border bg-background px-3 text-sm"
              value={filters.workflowStatus}
              onValueChange={(value) => setFilters({ workflowStatus: value })}
            >
              {[
                ["all", "All statuses"],
                ["active", "Active"],
                ["paused", "Paused"],
                ["draft", "Draft"],
              ].map(([v, l]) => (
                <SelectFieldOption key={v} value={v}>
                  {l}
                </SelectFieldOption>
              ))}
            </SelectField>
            <SelectField
              aria-label="Starting event filter"
              disabled={!filtersReady}
              className="h-10 max-w-full rounded border bg-background px-3 text-sm"
              value={filters.workflowTrigger}
              onValueChange={(value) => setFilters({ workflowTrigger: value })}
            >
              <SelectFieldOption value="all">All starting events</SelectFieldOption>
              {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                <SelectFieldOption key={v} value={v}>
                  {l}
                </SelectFieldOption>
              ))}
            </SelectField>
            <Button variant="ghost" onClick={() => setFilters(FILTERS)}>
              Clear filters
            </Button>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {visible.length} of {items.length} workflows
          </p>
          {loading ? (
            <p className="py-12 text-center text-muted-foreground">
              Loading workflows…
            </p>
          ) : !items.length ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <Workflow className="size-10 text-muted-foreground" />
                <div>
                  <h2 className="font-semibold">
                    Create your first candidate workflow
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Choose a purpose and published forms. Preview the result
                    before enabling account preparation and invitations.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/workflows/new">
                    <Plus /> Create workflow
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((w) => (
                <Card key={w.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Workflow className="size-5 text-muted-foreground" />
                      <Badge variant={w.active ? "default" : "secondary"}>
                        {w.active
                          ? "Published"
                          : w.version
                            ? "Paused"
                            : "Draft"}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3 break-words [overflow-wrap:anywhere]">
                      {w.name}
                    </CardTitle>
                    <CardDescription>
                      {w.version ? `Version ${w.version} · ` : ""}Updated{" "}
                      {runDate(w.updatedAt)}
                      <span className="mt-1 block">
                        Starts: {TRIGGER_LABELS[w.trigger ?? "staff_upload"]}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {w.businessSummary && (
                      <div className="mb-4 rounded-lg bg-muted/40 p-3 text-sm">
                        <p className="font-medium">
                          Then
                          {w.businessSummary.conditional
                            ? " (when approved / conditions match)"
                            : ""}
                        </p>
                        <ul className="mt-2 space-y-1 text-muted-foreground">
                          {w.businessSummary.actions.map((action) => (
                            <li key={action}>{action}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {w.latestRunStatus && (
                      <div className="mb-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Latest execution{" "}
                          {w.latestRunAt ? runDate(w.latestRunAt) : ""}
                        </p>
                        <RunBadge
                          status={w.latestRunStatus}
                          waitingFor={w.latestRunWaitingFor ?? undefined}
                        />
                      </div>
                    )}
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/workflows/${w.id}`}>Open workflow</Link>
                    </Button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!w.version && (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/workflows/new?draft=${w.id}`}>
                            Continue guided setup
                          </Link>
                        </Button>
                      )}
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/workflows/${w.id}?tab=runs${w.latestRunId ? `&run=${w.latestRunId}` : ""}`}
                        >
                          View executions
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!copying || busy}
                        onClick={() => void duplicate(w.id)}
                      >
                        {copying === w.id ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Copy />
                        )}
                        Duplicate as draft
                      </Button>
                    </div>
                    <div className="mt-3">
                      <ArchiveButton
                        type="workflow"
                        id={w.id}
                        label={w.name}
                        onArchived={() => void load()}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {!loading && items.length > 0 && !visible.length && (
            <Card>
              <CardContent className="py-12 text-center">
                <p>No workflows match these filters.</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => setFilters(FILTERS)}
                >
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="runs" className="mt-5">
          <WorkflowRunsView
            preferenceKey={`${props.preferenceKey}:executions`}
          />
        </TabsContent>
      </Tabs>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workflow for a purpose</DialogTitle>
            <DialogDescription>
              The starting event determines when this workflow runs. AI
              extraction remains optional.
            </DialogDescription>
          </DialogHeader>
          <div
            className="space-y-2"
            role="group"
            aria-label="Workflow purpose presets"
          >
            {Object.entries(WORKFLOW_PRESETS).map(([key, p]) => (
              <Button
                key={key}
                variant={preset === key ? "default" : "outline"}
                className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                aria-pressed={preset === key}
                onClick={() => setPreset(key as WorkflowPreset)}
              >
                {p.name}
              </Button>
            ))}
            <Button
              variant={preset === "custom" ? "default" : "outline"}
              onClick={() => setPreset("custom")}
            >
              Custom starting event
            </Button>
          </div>
          {preset !== "custom" && (
            <p className="text-sm text-muted-foreground">
              {WORKFLOW_PRESETS[preset].description}
            </p>
          )}
          {preset === "custom" && (
            <Select
              value={trigger}
              onValueChange={(v) => setTrigger(v as WorkflowTrigger)}
            >
              <SelectTrigger
                className="w-full"
                aria-label="Workflow starting event"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void create()}>
              Create workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
