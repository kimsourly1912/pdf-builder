"use client";
import { HandoffButton } from "@/features/interviews/handoff-button";
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
import { workflowApi, errorText } from "@/features/workflows/client";
import {
  STAGES,
  STAGE_LABELS,
  transitionRequirement,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
import { STAGE_DESCRIPTIONS, stageEvidence, preparationLabel, overrideEvidence } from "./stage-evidence";
import { stageAge, statusColor, runStatusLabel } from "./presentation";
import { useUrlFilters } from "./use-url-filters";
import { candidateNextAction } from "./submission-progress";
import { MoveDialog, MoveMenu } from "./progress-actions";
type Data = {
  items: CandidateProgress[];
  total: number;
  page: number;
  pageSize: number;
  stats: Record<CandidateStage, number>;
  needsAttention: number;
};
const FILTERS = {
  search: "",
  stage: "all",
  attention: "false",
  page: "1",
  sort: "recent",
};
const validFilter = (key: keyof typeof FILTERS, value: string) =>
  key === "stage"
    ? value === "all" || STAGES.includes(value as CandidateStage)
    : key === "attention"
      ? ["true", "false"].includes(value)
      : key === "sort"
        ? ["recent", "oldest", "newest"].includes(value)
        : key === "page"
          ? /^[1-9]\d{0,5}$/.test(value)
          : value.length <= 500;
export function ProgressDashboard({
  displayName,
  preferenceKey,
}: {
  displayName: string;
  preferenceKey: string;
}) {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState<"kanban" | "list">("kanban"),
    [viewReady, setViewReady] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [drag, setDrag] = useState<CandidateProgress | null>(null),
    [over, setOver] = useState<CandidateStage | null>(null),
    [move, setMove] = useState<{
      item: CandidateProgress;
      stage: CandidateStage;
    } | null>(null);
  const {
    filters,
    setFilters,
    ready: filtersReady,
  } = useUrlFilters(FILTERS, validFilter, `${preferenceKey}:filters`);
  const { search, stage, sort } = filters,
    attention = filters.attention === "true",
    page = Number(filters.page);
  const serial = useRef(0),
    dragRevision = useRef<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem(preferenceKey);
        if (saved === "list" || saved === "kanban") setView(saved);
      } catch {}
      setViewReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [preferenceKey]);
  const load = useCallback(
    async (clearError = true) => {
      if (!filtersReady) return;
      const n = ++serial.current;
      try {
        const result = await workflowApi<Data>(
          `/api/candidates?${new URLSearchParams({ search, stage, attention: String(attention), page: String(page), sort })}`,
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
    [search, stage, attention, page, sort, filtersReady],
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
        <div className="flex shrink-0 items-center gap-2">
          <GripVertical className="size-4 text-muted-foreground" aria-hidden />
          <MoveMenu item={item} onMove={(i, s) => void requestMove(i, s)} />
        </div>
      </div>
      <p className="break-all text-xs text-muted-foreground">{item.email}</p>
      {item.telegram && (
        <p className="text-xs text-muted-foreground">@{item.telegram}</p>
      )}
      <Badge
        variant="outline"
        className={`mt-2 ${statusColor(STAGE_LABELS[item.stage])}`}
      >
        {STAGE_LABELS[item.stage]}
      </Badge>
      <p className="mt-2 break-words text-xs text-muted-foreground">{stageEvidence(item)}</p>
      {item.manual && <p className="mt-1 break-words text-xs text-muted-foreground">{overrideEvidence(item)}</p>}
      {preparationLabel(item) && <p className="mt-1 text-xs font-medium">{preparationLabel(item)}</p>}
      {(item.cvUpdates ?? []).some(u => ["pending", "reviewing"].includes(u.status)) && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">CV update pending · application unchanged</p>}
      <p className="mt-3 truncate text-xs" title={item.currentCv?.fileName ?? item.selectedCv.fileName}>
        Current CV: {item.currentCv?.fileName ?? item.selectedCv.fileName}
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
      <HandoffButton item={item} onChanged={() => void load()} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {stageAge(item.stage, item.stageSince)}
        </span>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-auto max-w-full whitespace-normal text-left"
        >
          <Link href={candidateNextAction(item).href}>
            {candidateNextAction(item).next}
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </article>
  );
  return (
    <AppShell displayName={displayName} fullWidth={view === "kanban"}>
      <PageHeader
        title="Candidate Preparation"
        description="Follow CV review, candidate preparation and form completion. Drag a card or use Move to… to update the HR stage."
        actions={
          <div className="flex flex-wrap gap-2">
            <div
              className="flex gap-2 rounded-md border p-1"
              role="group"
              aria-label="Progress view"
            >
              <Button
                size="sm"
                variant={view === "kanban" ? "secondary" : "ghost"}
                disabled={!viewReady}
                aria-pressed={view === "kanban"}
                onClick={() => switchView("kanban")}
              >
                <Columns3 />
                Kanban
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "secondary" : "ghost"}
                disabled={!viewReady}
                aria-pressed={view === "list"}
                onClick={() => switchView("list")}
              >
                <List />
                List
              </Button>
            </div>
            <Button
              variant="outline"
              aria-label="Refresh Candidate Preparation"
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
      {!loading && !error && data?.total === 0 && (
        <div className="rounded-xl border bg-card p-6 text-card-foreground">
          <h2 className="font-semibold">{search || stage !== "all" || attention ? "No candidates match these filters" : "Add your first candidate"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{search || stage !== "all" || attention ? "Clear the filters to see all candidates, or receive a new CV." : "Ask candidates to submit through Telegram, or upload a CV received by your team."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(search || stage !== "all" || attention) && <Button variant="outline" onClick={() => setFilters({ ...FILTERS })}>Clear filters</Button>}
            <Button asChild><Link href="/intake">Receive candidates via Telegram</Link></Button>
            <Button asChild variant="outline"><Link href="/resumes?upload=true">Upload CV manually</Link></Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full sm:w-72"
          aria-label="Search Candidate Preparation"
          placeholder="Search name, email, Telegram or CV"
          disabled={!filtersReady}
          value={search}
          onChange={(e) => {
            setFilters({ search: e.target.value, page: "1" });
          }}
        />
        <Select
          disabled={!filtersReady}
          value={stage}
          onValueChange={(v) => {
            setFilters({ stage: v, page: "1" });
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
        <Select
          disabled={!filtersReady}
          value={sort}
          onValueChange={(v) => setFilters({ sort: v, page: "1" })}
        >
          <SelectTrigger aria-label="Sort Candidate Preparation" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recent activity</SelectItem>
            <SelectItem value="oldest">Longest waiting first</SelectItem>
            <SelectItem value="newest">Newest CV first</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={attention ? "secondary" : "outline"}
          disabled={!filtersReady}
          title="Candidates with outstanding HR tasks: CV reviews, blockers, or submitted forms to review."
          aria-pressed={attention}
          onClick={() => {
            setFilters({ attention: String(!attention), page: "1" });
          }}
        >
          <AlertTriangle />
          Needs attention ({data?.needsAttention ?? 0})
        </Button>
        <Button
          disabled={!filtersReady}
          variant="ghost"
          onClick={() => setFilters(FILTERS)}
        >
          Clear filters
        </Button>
        <span className="text-sm text-muted-foreground">
          {data?.total ?? 0} candidates
        </span>
      </div>
      {loading ? (
        <p className="py-16 text-center">Loading Candidate Preparation…</p>
      ) : view === "kanban" ? (
        <div className="max-w-full overflow-x-auto pb-4">
          <div className="grid min-w-[1740px] grid-cols-6 gap-4">
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
                <p className="mb-3 text-xs text-muted-foreground">{STAGE_DESCRIPTIONS[s]}</p>
                {data &&
                  data.stats[s] >
                    data.items.filter((i) => i.stage === s).length && (
                    <p className="mb-3 text-xs text-muted-foreground">
                      Showing {data.items.filter((i) => i.stage === s).length}{" "}
                      of {data.stats[s]} on this page
                      <button
                        className="block mt-1 underline"
                        onClick={() => setFilters({ stage: s, page: "1" })}
                      >
                        View {STAGE_LABELS[s]} candidates
                      </button>
                    </p>
                  )}
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
                  <TableCell><p>{i.currentCv?.fileName ?? i.selectedCv.fileName}</p>{i.currentCv && i.currentCv.id !== i.selectedCv.id && <p className="text-xs text-muted-foreground">Preparation: {i.selectedCv.fileName}</p>}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusColor(STAGE_LABELS[i.stage])}
                    >
                      {STAGE_LABELS[i.stage]}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stageAge(i.stage, i.stageSince)}
                      <span className="mt-1 block">{stageEvidence(i)}</span>
                      {i.manual && <span className="mt-1 block">{overrideEvidence(i)}</span>}
                    </p>
                  </TableCell>
                  <TableCell>
                    {i.run
                      ? runStatusLabel(i.run.status, i.run.waitingFor)
                      : i.facts.preparationCurrent ? "Forms assigned manually" : "Not started"}
                    {i.facts.invitationSent && (
                      <p className="text-xs">Invitation sent</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {i.facts.completed}/{i.facts.required} submitted
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="outline" size="sm">
                      <Link href={candidateNextAction(i).href}>
                        {candidateNextAction(i).next}
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell>
                    <HandoffButton item={i} onChanged={() => void load()} />
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
          Page {data?.page ?? page} · Up to 50 candidates per page. Column
          counts cover all candidates.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={(data?.page ?? page) <= 1}
            onClick={() =>
              setFilters({ page: String((data?.page ?? page) - 1) })
            }
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!data || page * data.pageSize >= data.total}
            onClick={() =>
              setFilters({ page: String((data?.page ?? page) + 1) })
            }
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
          setNotice("Candidate Preparation updated.");
          void load();
        }}
      />
    </AppShell>
  );
}
