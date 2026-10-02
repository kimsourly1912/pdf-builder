"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Columns3,
  List,
  RefreshCw,
  GripVertical,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import {
  STAGES,
  STAGE_LABELS,
  transitionRequirement,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
import { MoveDialog, MoveMenu } from "./progress-actions";
type Data = {
  items: CandidateProgress[];
  total: number;
  page: number;
  pageSize: number;
  stats: Record<CandidateStage, number>;
  needsAttention: number;
};
export function ProgressDashboard({
  displayName,
  preferenceKey,
}: {
  displayName: string;
  preferenceKey: string;
}) {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState<"kanban" | "list">("kanban"),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState("all"),
    [attention, setAttention] = useState(false),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [drag, setDrag] = useState<CandidateProgress | null>(null),
    [over, setOver] = useState<CandidateStage | null>(null),
    [move, setMove] = useState<{
      item: CandidateProgress;
      stage: CandidateStage;
    } | null>(null);
  const serial = useRef(0),
    dragRevision = useRef<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(preferenceKey);
        if (saved === "list" || saved === "kanban") setView(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, [preferenceKey]);
  const load = useCallback(
    async (clearError = true) => {
      const n = ++serial.current;
      try {
        const result = await workflowApi<Data>(
          `/api/candidates?${new URLSearchParams({ search, stage, attention: String(attention), page: String(page) })}`,
        );
        if (n === serial.current) {
          setData(result);
          if (clearError) setError("");
        }
      } catch (e) {
        if (n === serial.current) setError(errorText(e));
      } finally {
        if (n === serial.current) setLoading(false);
      }
    },
    [search, stage, attention, page],
  );
  const invalidate = useCallback(() => {
    ++serial.current;
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(t);
      invalidate();
    };
  }, [load, invalidate]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !dragRevision.current) void load();
    };
    const t = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  function switchView(v: "kanban" | "list") {
    setView(v);
    try {
      localStorage.setItem(preferenceKey, v);
    } catch {}
  }
  async function requestMove(item: CandidateProgress, target: CandidateStage) {
    if (item.stage === target) return;
    const required = transitionRequirement(item.facts, target),
      backward = STAGES.indexOf(target) < STAGES.indexOf(item.stage);
    if (required || backward || target === "approved" || target === "ready") {
      setMove({ item, stage: target });
      return;
    }
    try {
      await workflowApi(`/api/candidates/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "move",
          stage: target,
          expectedRevision: item.revision,
        }),
      });
      setNotice(`${item.name} moved to ${STAGE_LABELS[target]}.`);
      await load();
    } catch (e) {
      setNotice("");
      setError(errorText(e));
      void load(false);
    }
  }
  function nextAction(item: CandidateProgress) {
    return item.attention.length
      ? "Resolve issue"
      : item.run && ["queued", "running"].includes(item.run.status)
        ? "View preparation"
        : item.stage === "new" || item.stage === "reviewing"
          ? "Review CV"
          : item.stage === "approved"
            ? "Prepare candidate"
            : item.stage === "awaiting_forms"
              ? "View forms"
              : "Review submissions";
  }
  const card = (item: CandidateProgress) => (
    <article
      key={item.id}
      draggable={!loading}
      data-candidate-id={item.id}
      aria-label={`${item.name}, ${STAGE_LABELS[item.stage]}`}
      className="rounded-lg border bg-card p-4 shadow-xs cursor-grab active:cursor-grabbing"
      onDragStart={(e) => {
        setDrag(item);
        dragRevision.current = item.revision;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
        dragRevision.current = null;
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/candidates/${item.id}`}
          className="font-semibold hover:underline break-words"
        >
          {item.name}
        </Link>
        <div className="flex shrink-0 items-center">
          <GripVertical className="size-4 text-muted-foreground" aria-hidden />
          <MoveMenu item={item} onMove={(i, s) => void requestMove(i, s)} />
        </div>
      </div>
      <p className="break-all text-xs text-muted-foreground">{item.email}</p>
      {item.telegram && (
        <p className="text-xs text-muted-foreground">@{item.telegram}</p>
      )}
      <p className="mt-3 truncate text-xs" title={item.selectedCv.fileName}>
        CV: {item.selectedCv.fileName}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="secondary">
          {item.facts.completed}/{item.facts.required} forms submitted
        </Badge>
        {item.run && ["queued", "running"].includes(item.run.status) && (
          <Badge variant="outline">Preparing</Badge>
        )}
        {item.facts.invitationSent && (
          <Badge variant="outline">Invitation sent</Badge>
        )}
        {item.manual && <Badge variant="outline">HR stage</Badge>}
      </div>
      {item.attention.length > 0 && (
        <p className="mt-3 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          {item.attention[0]}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {runDate(item.lastActivity)}
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/candidates/${item.id}`}>
            {nextAction(item)}
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
  return (
    <AppShell displayName={displayName} fullWidth>
      <PageHeader
        title="Candidate progress"
        description="Follow CV review, candidate preparation and form completion. Drag a card or use Move to… to update the HR stage."
        actions={
          <div className="flex gap-2">
            <div
              className="flex rounded-md border p-1"
              role="group"
              aria-label="Progress view"
            >
              <Button
                size="sm"
                variant={view === "kanban" ? "secondary" : "ghost"}
                aria-pressed={view === "kanban"}
                onClick={() => switchView("kanban")}
              >
                <Columns3 />
                Kanban
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                aria-pressed={view === "list"}
                onClick={() => switchView("list")}
              >
                <List />
                List
              </Button>
            </div>
            <Button
              variant="outline"
              aria-label="Refresh candidate progress"
              onClick={() => void load()}
            >
              <RefreshCw />
            </Button>
          </div>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {notice}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full sm:w-72"
          aria-label="Search candidate progress"
          placeholder="Search name, email, Telegram or CV"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={stage}
          onValueChange={(v) => {
            setStage(v);
            setPage(1);
          }}
        >
          <SelectTrigger
            aria-label="Filter by candidate stage"
            className="w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={attention ? "secondary" : "outline"}
          aria-pressed={attention}
          onClick={() => {
            setAttention(!attention);
            setPage(1);
          }}
        >
          <AlertTriangle />
          Needs attention ({data?.needsAttention ?? 0})
        </Button>
        <span className="text-sm text-muted-foreground">
          {data?.total ?? 0} candidates
        </span>
      </div>
      {loading ? (
        <p className="py-16 text-center">Loading candidate progress…</p>
      ) : view === "kanban" ? (
        <div className="max-w-full overflow-x-auto pb-4">
          <div className="grid min-w-[1450px] grid-cols-5 gap-4">
            {STAGES.map((s) => (
              <section
                key={s}
                data-stage={s}
                aria-label={`${STAGE_LABELS[s]} column`}
                className={`min-h-80 rounded-xl border p-3 transition-colors ${over === s ? (drag && transitionRequirement(drag.facts, s) ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : "border-primary bg-primary/5") : "bg-muted/40"}`}
                onDragOver={(e) => {
                  if (drag) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOver(s);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const item = drag;
                  if (item && e.dataTransfer.getData("text/plain") === item.id)
                    void requestMove(item, s);
                  setDrag(null);
                  setOver(null);
                  dragRevision.current = null;
                }}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{STAGE_LABELS[s]}</h2>
                  <Badge variant="secondary">{data?.stats[s] ?? 0}</Badge>
                </div>
                {over === s && drag && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    {transitionRequirement(drag.facts, s)
                      ? "Action required before this move"
                      : "Drop to move candidate"}
                  </p>
                )}
                <div className="space-y-3">
                  {data?.items.filter((i) => i.stage === s).map(card)}
                  {!data?.items.some((i) => i.stage === s) && (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      No candidates on this page.
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Candidate",
                  "Selected CV",
                  "Stage",
                  "Preparation",
                  "Forms",
                  "Next action",
                  "Move",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      className="font-medium hover:underline"
                      href={`/candidates/${i.id}`}
                    >
                      {i.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{i.email}</p>
                    {i.attention.length > 0 && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {i.attention[0]}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{i.selectedCv.fileName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STAGE_LABELS[i.stage]}</Badge>
                  </TableCell>
                  <TableCell>
                    {i.run?.status.replaceAll("_", " ") ?? "Not started"}
                    {i.facts.invitationSent && (
                      <p className="text-xs">Invitation sent</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {i.facts.completed}/{i.facts.required} submitted
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/candidates/${i.id}`}>{nextAction(i)}</Link>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <MoveMenu
                      item={i}
                      onMove={(item, s) => void requestMove(item, s)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {!data?.items.length && (
                <TableRow>
                  <TableCell colSpan={7} className="py-14 text-center">
                    No candidates match these filters. Received CVs appear here
                    automatically.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p>
          Page {page} · Up to 50 candidates per page. Column counts cover all
          candidates.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!data || page * data.pageSize >= data.total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <MoveDialog
        key={move ? `${move.item.id}:${move.stage}` : "closed"}
        move={move}
        onClose={() => setMove(null)}
        onChanged={() => {
          setNotice("Candidate progress updated.");
          void load();
        }}
      />
    </AppShell>
  );
}
