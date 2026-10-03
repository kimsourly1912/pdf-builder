"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { workflowApi, errorText } from "@/features/workflows/client";
import {
  ATTENTION_TYPES,
  attentionAge,
  attentionResponsibility,
  type AttentionPage,
} from "./attention";
const DEFAULTS = {
  responsibility: "all",
  search: "",
  type: "all",
  sort: "priority",
  page: "1",
};
function validFilter(key: keyof typeof DEFAULTS, value: string) {
  return key === "responsibility"
    ? ["all", "hr", "candidate"].includes(value)
    : key === "search"
      ? value.length <= 200
      : key === "type"
        ? value === "all" || Object.hasOwn(ATTENTION_TYPES, value)
        : key === "sort"
          ? ["priority", "oldest"].includes(value)
          : /^\d{1,7}$/u.test(value) && Number(value) > 0;
}
export function AttentionDashboard({
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
  );
  const [data, setData] = useState<AttentionPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!ready) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await workflowApi<AttentionPage>(
        `/api/needs-attention?${new URLSearchParams(filters)}`,
      );
      if (id === requestId.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (id === requestId.current) setError(errorText(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters, ready]);
  const invalidateRequests = useCallback(() => {
    ++requestId.current;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250),
      interval = setInterval(() => void load(), 60000);
    return () => {
      invalidateRequests();
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [load, invalidateRequests]);
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Needs attention"
        description="Choose your next HR action, or check forms waiting on candidates."
        actions={
          <Button
            variant="outline"
            disabled={loading || !ready}
            onClick={() => void load()}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh tasks
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        {data
          ? `${data.overallTotal} open tasks · ${data.candidates} linked candidates`
          : "Loading tasks…"}{" "}
        · One candidate can have more than one task.
      </p>
      <div
        role="group"
        aria-label="Who acts next"
        className="flex flex-wrap gap-2"
      >
        {[
          ["hr", "Your actions"],
          ["candidate", "Waiting on candidates"],
          ["all", "All tasks"],
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={filters.responsibility === key ? "default" : "outline"}
            aria-pressed={filters.responsibility === key}
            disabled={!ready}
            onClick={() =>
              setFilters({ responsibility: key, type: "all", page: "1" })
            }
          >
            {label}
            {data && key !== "all"
              ? ` (${data.responsibilityCounts[key as "hr" | "candidate"]})`
              : ""}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        <Input
          aria-label="Search attention tasks"
          placeholder="Search candidate, email, CV or form…"
          className="min-w-0 flex-1 sm:min-w-64"
          disabled={!ready}
          value={filters.search}
          onChange={(e) => setFilters({ search: e.target.value, page: "1" })}
        />
        <select
          aria-label="Issue type"
          className="h-10 max-w-full rounded-md border bg-background px-3 text-sm"
          disabled={!ready}
          value={filters.type}
          onChange={(e) => setFilters({ type: e.target.value, page: "1" })}
        >
          <option value="all">All task types</option>
          {Object.entries(ATTENTION_TYPES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
              {data
                ? ` (${data.counts[key as keyof typeof ATTENTION_TYPES]})`
                : ""}
            </option>
          ))}
        </select>
        <select
          aria-label="Task order"
          className="h-10 rounded-md border bg-background px-3 text-sm"
          disabled={!ready}
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value, page: "1" })}
        >
          <option value="priority">Blockers first</option>
          <option value="oldest">Longest waiting</option>
        </select>
        <Button
          variant="ghost"
          disabled={!ready}
          onClick={() => setFilters(DEFAULTS)}
        >
          Clear filters
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not refresh tasks: {error}
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              Retry tasks
            </Button>
            {data && (
              <p>
                Showing the last loaded tasks. Open a task to check its current
                state.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      <section
        aria-label="Attention tasks"
        aria-busy={loading}
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Tasks{data ? ` · ${data.total} matching` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            Refreshes every minute. Waiting does not mean overdue.
          </p>
        </div>
        {!data && loading ? (
          <p className="py-12 text-center text-muted-foreground">
            Loading attention tasks…
          </p>
        ) : data?.items.length ? (
          <div className="divide-y">
            {data.items.map((task) => (
              <article
                key={task.id}
                className="flex min-w-0 flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-2">
                  <Badge
                    variant="outline"
                    className={
                      task.urgent ? "border-amber-300 text-amber-700" : ""
                    }
                  >
                    {ATTENTION_TYPES[task.type]}
                  </Badge>
                  <p className="text-xs font-medium text-muted-foreground">
                    {attentionResponsibility(task) === "candidate"
                      ? "Waiting for candidate answers"
                      : "HR action needed"}
                  </p>
                  <p className="break-words font-medium">
                    {task.candidateId ? (
                      <Link
                        className="underline underline-offset-4"
                        href={`/candidates/${task.candidateId}`}
                      >
                        {task.name}
                      </Link>
                    ) : (
                      task.name
                    )}
                  </p>
                  {task.email && (
                    <p className="break-all text-xs text-muted-foreground">
                      {task.email}
                    </p>
                  )}
                  <p className="break-words text-sm">{task.detail}</p>
                  <p className="max-w-3xl break-words text-sm text-muted-foreground">
                    {task.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.since
                      ? `${task.sinceLabel} · ${attentionAge(task.since)} ago`
                      : "Start time unknown"}
                    {task.since && (
                      <span> · {new Date(task.since).toLocaleString()}</span>
                    )}
                  </p>
                </div>
                <Button
                  asChild
                  variant={task.urgent ? "default" : "outline"}
                  className="shrink-0 self-start sm:self-center"
                >
                  <Link href={task.href}>{task.action}</Link>
                </Button>
              </article>
            ))}
          </div>
        ) : data ? (
          <div className="space-y-3 py-12 text-center">
            <CheckCircle2 className="mx-auto size-8 text-muted-foreground" />
            <h3 className="font-medium">
              {data.overallTotal
                ? "No tasks match these filters"
                : "You’re up to date"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {data.overallTotal
                ? "Change the search or clear filters to see open tasks."
                : "New CVs, preparation issues and form submissions will appear here."}
            </p>
            {data.overallTotal ? (
              <Button variant="outline" onClick={() => setFilters(DEFAULTS)}>
                Show all tasks
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/candidates">Open candidates</Link>
              </Button>
            )}
          </div>
        ) : (
          <p className="py-10 text-center text-muted-foreground">
            Tasks are unavailable. Use Retry tasks above.
          </p>
        )}
        {data && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
            <span>
              {data.total
                ? `${(data.page - 1) * 25 + 1}–${Math.min(data.page * 25, data.total)} of ${data.total}`
                : "0 tasks"}{" "}
              · Page {data.page} of {data.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || data.page <= 1}
                onClick={() => setFilters({ page: String(data.page - 1) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || data.page >= data.totalPages}
                onClick={() => setFilters({ page: String(data.page + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
