"use client";

import { Activity, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { AppShell } from "@/components/patterns/app-shell";
import { DataView, DataViewContent, DataViewHeader } from "@/components/patterns/data-view";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { MetricCard } from "@/components/patterns/metric-card";
import { PageHeader } from "@/components/patterns/page-header";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableColumnHeader,
} from "@/components/ui/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table-features";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { pageMetaFromPayload } from "@/features/pagination/pagination";
import type { PageMeta } from "@/features/pagination/pagination";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";

type AuditEventSummary = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type AuditPayload = {
  items?: AuditEventSummary[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
  error?: string;
};

const EMPTY_PAGE_META: PageMeta = {
  page: 1,
  pageSize: 25,
  totalItems: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false,
};

const ACTION_LABELS: Record<string, string> = {
  "account.created": "Account created",
  "assignment.created": "Form assigned",
  "link.regenerated": "Fill link regenerated",
  "link.revoked": "Fill link revoked",
  "resume.deleted": "Resume deleted",
  "resume.uploaded": "Resume uploaded",
  "submission.completed": "Submission completed",
  "template.archived": "Template archived",
  "template.created": "Template created",
  "template.deleted": "Template deleted",
  "template.published": "Template published",
  "template.restored": "Template restored",
};

export function AuditLog(props: { displayName: string }) {
  const [events, setEvents] = useState<AuditEventSummary[]>([]);
  const [pageMeta, setPageMeta] = useState<PageMeta>(EMPTY_PAGE_META);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timeZone = resolvedLocalTimeZone();

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: String(pageMeta.page),
        pageSize: String(pageMeta.pageSize),
      });
      if (search) query.set("search", search);
      const response = await fetch(`/api/audit-events?${query}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as AuditPayload;
      if (!response.ok) {
        throw new Error(payload.error || "Activity could not be loaded.");
      }
      setEvents(payload.items ?? []);
      setPageMeta((current) => pageMetaFromPayload(payload, current));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Activity could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [pageMeta.page, pageMeta.pageSize, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadEvents(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadEvents]);

  const columns = useMemo<
    ColumnDef<DataTableFeatures, AuditEventSummary>[]
  >(
    () => [
      {
        id: "activity",
        accessorFn: (event) =>
          `${ACTION_LABELS[event.action] ?? event.action} ${event.targetType}`,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Activity" />
        ),
        meta: { className: "min-w-56 whitespace-normal" },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">
              {ACTION_LABELS[row.original.action] ?? row.original.action}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.original.targetType} · {shortId(row.original.targetId)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "actorType",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Actor" />
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.actorType}
          </Badge>
        ),
      },
      {
        id: "details",
        accessorFn: (event) => formatMetadata(event.metadata),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Details" />
        ),
        meta: { className: "min-w-56 max-w-md whitespace-normal text-xs" },
        cell: ({ row }) => formatMetadata(row.original.metadata) || "—",
      },
      {
        accessorKey: "requestId",
        header: "Request",
        meta: { className: "min-w-36 font-mono text-xs text-muted-foreground" },
        cell: ({ row }) => shortId(row.original.requestId),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Time" />
        ),
        meta: { className: "min-w-44 text-xs text-muted-foreground" },
        cell: ({ row }) =>
          formatLocalDateTime(row.original.createdAt, { timeZone }),
      },
    ],
    [timeZone],
  );

  return (
    <AppShell displayName={props.displayName}>
      <PageHeader
        title="Activity"
        description="Review the immutable history of sensitive document and account actions."
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadEvents()}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          icon={<Activity />}
          value={pageMeta.totalItems}
          label="Recorded events"
          tone="primary"
        />
        <MetricCard
          icon={<ShieldCheck />}
          value={events.length}
          label="Events on this page"
          tone="success"
        />
      </section>

      {error && (
        <FeedbackAlert
          tone="error"
          title="Activity unavailable"
          description={error}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <DataView>
          <DataViewHeader>
            <form
              className="flex w-full max-w-xl gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setPageMeta((current) => ({ ...current, page: 1 }));
                setSearch(searchDraft.trim());
              }}
            >
              <InputGroup>
                <InputGroupAddon><Search /></InputGroupAddon>
                <InputGroupInput
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search action, target, actor, or ID"
                  aria-label="Search activity"
                />
              </InputGroup>
              <Button type="submit">Search</Button>
            </form>
          </DataViewHeader>
          <DataViewContent>
            <DataTable
              columns={columns}
              data={events}
              getRowId={(event) => event.id}
              caption="Immutable audit activity"
              emptyTitle="No activity recorded yet"
              emptyDescription="New template, account, assignment, and submission actions will appear here."
              emptyIcon={<Activity />}
              initialPageSize={pageMeta.pageSize}
              hidePagination
              surface="embedded"
            />
            <ServerPagination
              meta={pageMeta}
              disabled={loading}
              onPageChange={(page) => setPageMeta((current) => ({ ...current, page }))}
              onPageSizeChange={(pageSize) => setPageMeta((current) => ({ ...current, page: 1, pageSize }))}
            />
          </DataViewContent>
        </DataView>
      )}
    </AppShell>
  );
}

function shortId(value: string | null): string {
  if (!value) return "—";
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`)
    .join(" · ");
}

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase();
}
