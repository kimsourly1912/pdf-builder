"use client";
import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Trash2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import { ARCHIVE_TYPES, ARCHIVE_LABELS, type ArchiveType } from "./archive";
type Item = {
  id: string;
  entity_type: ArchiveType;
  entity_id: string;
  label: string;
  archived_at: string;
  archived_by: string;
  related_count: number;
};
export function ArchiveDashboard({ displayName }: { displayName: string }) {
  const [data, setData] = useState<{ items: Item[]; total: number }>({
      items: [],
      total: 0,
    }),
    [type, setType] = useState("all"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<{
      label: string;
      details: Record<string, string | number>;
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<Item | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [impact, setImpact] = useState<{
      members: { label: string; entity_type: ArchiveType }[];
      blockers: { reason: string | null }[];
    } | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const d = await workflowApi<typeof data>(
          `/api/archive?${new URLSearchParams({ type, search, page: String(page) })}`,
          { signal },
        );
        if (!signal?.aborted) setData(d);
      } catch (e) {
        if (!signal?.aborted) setError(errorText(e));
      }
    },
    [type, search, page],
  );
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => void load(controller.signal), 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  async function restore(item: Item) {
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/archive/${item.entity_type}/${item.entity_id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "restore",
          expectedArchivedAt: item.archived_at,
        }),
      });
      setNotice(
        "Restored. Workflows remain paused and interrupted runs require an explicit retry; no new workflow or AI request was started.",
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function preview(item: Item) {
    setSelected(item);
    setConfirmation("");
    setImpact(null);
    setError("");
    try {
      setImpact(
        await workflowApi(`/api/archive/${item.entity_type}/${item.entity_id}`),
      );
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(
        `/api/archive/${selected.entity_type}/${selected.entity_id}`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "delete",
            confirm: true,
            expectedArchivedAt: selected.archived_at,
          }),
        },
      );
      setSelected(null);
      setNotice(
        "Permanently deleted. Stored files are removed through the cleanup queue.",
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const blockers = impact?.blockers.filter((b) => b.reason) ?? [];
  return (
    <AppShell displayName={displayName} fullWidth>
      <PageHeader
        title="Archive"
        description="Restore archived records or permanently delete eligible data. Completed submissions and linked history remain protected."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <Tabs
        value={type}
        onValueChange={(v) => {
          setType(v);
          setPage(1);
        }}
      >
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="all">All records</TabsTrigger>
            {ARCHIVE_TYPES.map((t) => (
              <TabsTrigger key={t} value={t}>
                {ARCHIVE_LABELS[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <Input
        aria-label="Search archive"
        placeholder="Search archived records"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {["Record", "Type", "Archived", "Archived by", "Actions"].map(
                (h) => (
                  <TableHead key={h}>{h}</TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="min-w-48 whitespace-normal">
                  <p className="font-medium">{item.label}</p>
                  {item.related_count > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {item.related_count} linked records restored or deleted
                      together
                    </p>
                  )}
                </TableCell>
                <TableCell>{ARCHIVE_LABELS[item.entity_type]}</TableCell>
                <TableCell>{runDate(item.archived_at)}</TableCell>
                <TableCell>{item.archived_by}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const d = await workflowApi<{
                            details: Record<string, string | number>;
                          }>(
                            `/api/archive/${item.entity_type}/${item.entity_id}`,
                          );
                          setView({ label: item.label, details: d.details });
                        } catch (e) {
                          setError(errorText(e));
                        }
                      }}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void restore(item)}
                    >
                      <ArchiveRestore />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void preview(item)}
                    >
                      <Trash2 />
                      Delete permanently
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!data.items.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-40 text-center text-muted-foreground"
                >
                  <Archive className="mx-auto mb-2" />
                  No archived records match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {data.total} archived records · Page {page}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page * 50 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete permanently?</DialogTitle>
            <DialogDescription>
              Deletion cannot be undone. Review the affected records below.
              Existing audit history is preserved.
            </DialogDescription>
          </DialogHeader>
          {impact ? (
            <>
              <ul className="list-disc pl-5 text-sm">
                {impact.members.map((m, i) => (
                  <li key={i}>
                    {ARCHIVE_LABELS[m.entity_type]}: {m.label}
                  </li>
                ))}
              </ul>
              {blockers.length ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {blockers.map((b) => b.reason).join(" ")}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-sm">
                    Type <strong>{selected?.label}</strong> to confirm.
                  </p>
                  <Input
                    aria-label="Confirm permanent deletion"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Checking linked records…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy ||
                !impact ||
                !!blockers.length ||
                confirmation !== selected?.label
              }
              onClick={() => void remove()}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!view}
        onOpenChange={(v) => {
          if (!v) setView(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{view?.label}</DialogTitle>
            <DialogDescription>Archived record overview</DialogDescription>
          </DialogHeader>
          <dl className="space-y-3">
            {Object.entries(view?.details ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <DialogFooter>
            <Button onClick={() => setView(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
