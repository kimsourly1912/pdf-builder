"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { errorText } from "@/features/workflows/client";
import {
  ACTIVE_STAGES,
  OUTCOMES,
  INTERVIEW_LABELS,
  interviewNextAction,
  appointmentDisplay,
  type InterviewProcess,
} from "./interviews";
import { interviewApi, InterviewApiError } from "./client";
const DEFAULTS = { search: "", tab: "active", filter: "all", page: "1" };
function validFilter(key: keyof typeof DEFAULTS, value: string) {
  return key === "tab"
    ? ["active", "closed"].includes(value)
    : key === "filter"
      ? ["all", "hold", ...ACTIVE_STAGES, ...OUTCOMES].includes(value)
      : key === "page"
        ? /^[1-9]\d{0,5}$/.test(value)
        : value.length <= 200;
}
type Board = {
  items: InterviewProcess[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
  active: number;
  closed: number;
};
export function InterviewDashboard({
  displayName,
  preferenceKey,
}: {
  displayName: string;
  preferenceKey: string;
}) {
  const { filters, setFilters, ready } = useUrlFilters(
      DEFAULTS,
      validFilter,
      preferenceKey,
    ),
    [data, setData] = useState<Board | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [permission, setPermission] = useState(false),
    serial = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++serial.current;
    setLoading(true);
    try {
      const result = await interviewApi<Board>(
        `/api/interviews?${new URLSearchParams(filters)}`,
      );
      if (sequence === serial.current) {
        setData(result);
        setError("");
        setPermission(false);
      }
    } catch (e) {
      if (sequence === serial.current) {
        setError(errorText(e));
        setPermission(
          e instanceof InterviewApiError && [401, 403].includes(e.status),
        );
      }
    } finally {
      if (sequence === serial.current) setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [ready, load]);
  const closed = filters.tab === "closed",
    stages = closed ? OUTCOMES : ACTIVE_STAGES;
  const page = data?.page ?? 1,
    total = data?.total ?? 0,
    pageSize = data?.pageSize ?? 25;
  function card(p: InterviewProcess) {
    const round = p.rounds.at(-1),
      next = p.rounds.find((r) => r.status === "scheduled");
    return (
      <article
        key={p.id}
        className="min-w-0 space-y-3 rounded-lg border bg-card p-4 shadow-sm"
      >
        <div className="space-y-1">
          <Link
            className="block break-words font-semibold underline-offset-4 hover:underline"
            href={`/interviews/${p.id}`}
          >
            {p.snapshot.name}
          </Link>
          <p className="break-words text-sm text-muted-foreground">
            {p.snapshot.email}
            {p.snapshot.telegram && ` · @${p.snapshot.telegram}`}
          </p>
          <p className="break-words text-sm font-medium">{p.position}</p>
        </div>
        {p.hold && (
          <StatusBadge
            label={`On hold${p.hold.followUp ? ` · follow up ${p.hold.followUp}` : ""}`}
            tone="warning"
          />
        )}
        <p className="text-sm">
          Current round:{" "}
          {round ? `${p.rounds.length} · ${round.name}` : "No rounds yet"}
        </p>
        <p className="break-words text-xs text-muted-foreground">
          {next
            ? `Next: ${appointmentDisplay(next.appointment)}`
            : "No next appointment"}
        </p>
        <p className="break-words text-xs text-muted-foreground">
          Responsible: {p.responsible}
        </p>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-auto max-w-full whitespace-normal"
        >
          <Link href={`/interviews/${p.id}`}>{interviewNextAction(p)}</Link>
        </Button>
      </article>
    );
  }
  return (
    <AppShell displayName={displayName} fullWidth={!closed}>
      <PageHeader
        title="Interview Progress"
        description="Manage rounds, feedback and final review after documents are accepted. Interview passed does not mean Hired."
        actions={
          <Button
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />
      <Tabs
        value={filters.tab}
        onValueChange={(tab) => setFilters({ tab, filter: "all", page: "1" })}
      >
        <TabsList>
          <TabsTrigger value="active">
            Active{data && ` (${data.active})`}
          </TabsTrigger>
          <TabsTrigger value="closed">
            Closed{data && ` (${data.closed})`}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full min-w-0 space-y-2 sm:w-auto sm:flex-1">
          <Label htmlFor="interview-search">Search interviews</Label>
          <Input
            id="interview-search"
            value={filters.search}
            maxLength={200}
            placeholder="Name, email, Telegram or position"
            onChange={(e) => setFilters({ search: e.target.value, page: "1" })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="interview-filter">
            {closed ? "Outcome" : "Stage"}
          </Label>
          <SelectField
            id="interview-filter"
            className="w-full sm:w-52"
            value={filters.filter}
            onValueChange={(filter) => setFilters({ filter, page: "1" })}
          >
            <SelectFieldOption value="all">
              All {closed ? "outcomes" : "stages"}
            </SelectFieldOption>
            {stages.map((s) => (
              <SelectFieldOption key={s} value={s}>
                {INTERVIEW_LABELS[s]}
              </SelectFieldOption>
            ))}
            {!closed && (
              <SelectFieldOption value="hold">On hold</SelectFieldOption>
            )}
          </SelectField>
        </div>
        <Button
          variant="ghost"
          onClick={() => setFilters({ ...DEFAULTS, tab: filters.tab })}
        >
          Clear filters
        </Button>
      </div>
      {error && (
        <FeedbackAlert
          tone="error"
          title={
            permission
              ? "Interview access required"
              : "Interview progress could not be loaded"
          }
          description={
            <div className="space-y-2">
              <p>{error}</p>
              {permission ? (
                <Link href="/sign-in" className="underline">
                  Sign in with the management owner account
                </Link>
              ) : (
                <Button variant="outline" onClick={() => void load()}>
                  Try again
                </Button>
              )}
            </div>
          }
        />
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading interview progress…
        </p>
      )}
      {!permission && data && data.items.length === 0 && (
        <FeedbackAlert
          title={closed ? "No closed interviews" : "No active interviews"}
          description={
            <p>
              {filters.search || filters.filter !== "all"
                ? "Clear filters to see more interview processes."
                : "Start an interview process from Candidate Preparation after HR accepts the required documents."}{" "}
              <Link href="/candidates" className="underline">
                Open Candidate Preparation
              </Link>
            </p>
          }
        />
      )}
      {!permission &&
        !!data?.items.length &&
        (closed ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map(card)}
          </div>
        ) : (
          <div
            role="region"
            aria-label="Active interview board"
            tabIndex={0}
            className="min-w-0 max-w-full overflow-x-auto rounded-lg border p-3"
          >
            <div className="grid w-max min-w-full grid-cols-4 gap-4">
              {ACTIVE_STAGES.map((stage) => (
                <section key={stage} className="w-72 space-y-3">
                  <h2 className="flex items-center justify-between gap-2 font-semibold">
                    {INTERVIEW_LABELS[stage]}
                    <span className="text-xs font-normal">
                      {data.items.filter((p) => p.stage === stage).length} shown
                      · {data.counts[stage]} total
                    </span>
                  </h2>
                  {data.items.filter((p) => p.stage === stage).map(card)}
                  {!data.items.some((p) => p.stage === stage) && (
                    <p className="rounded border border-dashed p-4 text-xs text-muted-foreground">
                      No interviews on this page.
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>
        ))}
      {data && !permission && (
        <ServerPagination
          disabled={loading}
          meta={{
            page,
            pageSize,
            totalItems: total,
            totalPages: Math.ceil(total / pageSize),
            hasPreviousPage: page > 1,
            hasNextPage: page * pageSize < total,
          }}
          onPageChange={(page) => setFilters({ page: String(page) })}
        />
      )}
    </AppShell>
  );
}
