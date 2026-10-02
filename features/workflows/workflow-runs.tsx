"use client";
import { RunTelegramAction } from "@/features/telegram/run-telegram-action";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock3, RefreshCw, XCircle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { workflowApi, errorText, runDate } from "./client";
import { STEP_LABELS, type WorkflowRun, type RunStatus } from "./workflow";

const STATUS_LABELS: Record<RunStatus, string> = { queued: "Queued", running: "Running", waiting_review: "Waiting for review", completed: "Completed", rejected: "Rejected", failed: "Failed" };
export function RunBadge({ status, waitingFor }: { status: RunStatus; waitingFor?: string }) {
  const color = status === "failed" ? "border-red-200 bg-red-50 text-red-700" : status === "waiting_review" ? "border-amber-200 bg-amber-50 text-amber-700" : status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "running" ? "border-blue-200 bg-blue-50 text-blue-700" : "";
  return <Badge variant="outline" className={color}>{waitingFor === "telegram" ? "Waiting for Telegram connection" : waitingFor === "telegram_retry" ? "Telegram retry pending" : STATUS_LABELS[status]}</Badge>;
}
type RunsData = { items: WorkflowRun[]; total: number; page: number; stats: Partial<Record<RunStatus, number>> };

export function WorkflowRunsView({ workflowId }: { workflowId?: string }) {
  const [data, setData] = useState<RunsData | null>(null); const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [days, setDays] = useState("7"); const [page, setPage] = useState(1);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [selected, setSelected] = useState<WorkflowRun | null>(null); const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try { const query = new URLSearchParams({ page: String(page), search, days }); if (workflowId) query.set("workflowId", workflowId); if (status !== "all") query.set("status", status); const result = await workflowApi<RunsData>(`/api/workflow-runs?${query}`); if (id === requestId.current) { setData(result); setError(""); } }
    catch (e) { if (id === requestId.current) setError(errorText(e)); } finally { if (id === requestId.current) setLoading(false); }
  }, [workflowId, page, search, status, days]);
  const invalidateRequests = useCallback(() => { ++requestId.current; }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); const interval = window.setInterval(() => void load(), 10000); return () => { invalidateRequests(); window.clearTimeout(timer); window.clearInterval(interval); }; }, [load, invalidateRequests]);
  const selectedId = selected?.id;
  useEffect(() => { if (!selectedId) return; const timer = window.setInterval(() => { void workflowApi<{ run: WorkflowRun }>(`/api/workflow-runs/${selectedId}`).then(d => setSelected(d.run)).catch(e => setError(errorText(e))); }, 10000); return () => window.clearInterval(timer); }, [selectedId]);
  async function act(action: "retry" | "return_review") {
    if (!selected) return; setBusy(true);
    try { const d = await workflowApi<{ run: WorkflowRun }>(`/api/workflow-runs/${selected.id}`, { method: "PATCH", body: JSON.stringify({ action, expectedUpdatedAt: selected.updatedAt }) }); setSelected(d.run); await load(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const total = Object.values(data?.stats ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["Total runs", total], ["Waiting for review", data?.stats.waiting_review ?? 0], ["Completed", data?.stats.completed ?? 0], ["Failed", data?.stats.failed ?? 0]].map(([label, value]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></CardContent></Card>)}</div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card className="overflow-hidden"><CardContent className="p-0"><div className="space-y-4 p-5"><h2 className="font-semibold">Workflow runs</h2><div className="flex flex-wrap gap-3"><Input className="min-w-48 flex-1" placeholder="Search candidate or resume" aria-label="Search runs" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <Select value={status} onValueChange={v => { setStatus(v); setPage(1); }}><SelectTrigger className="w-48" aria-label="Run status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABELS).map(([s, label]) => <SelectItem key={s} value={s}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={days} onValueChange={v => { setDays(v); setPage(1); }}><SelectTrigger className="w-40" aria-label="Date range"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Last 24 hours</SelectItem><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="all">All time</SelectItem></SelectContent></Select>
      <Button variant="outline" size="icon" aria-label="Refresh runs" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Candidate / Resume</TableHead><TableHead>Status</TableHead><TableHead>Current step</TableHead><TableHead>Started</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>
        {data?.items.map(r => <TableRow key={r.id}><TableCell><p className="font-medium">{r.candidateName}</p><p className="max-w-60 truncate text-xs text-muted-foreground">{r.fileName}</p>{!workflowId && <p className="text-xs text-muted-foreground">{r.workflowName}</p>}</TableCell><TableCell><RunBadge status={r.status} waitingFor={r.context.waitingFor} /></TableCell><TableCell>{STEP_LABELS[r.graph.nodes.find(n => n.id === r.currentNodeId)?.kind ?? "complete"]}</TableCell><TableCell className="whitespace-nowrap">{runDate(r.createdAt)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{r.status === "waiting_review" && r.graph.nodes.find(n=>n.id === r.currentNodeId)?.kind === "review_resume" && <Button asChild size="sm"><Link href={`/workflows/runs/${r.id}/review`}>Review CV</Link></Button>}<Button size="sm" variant="outline" onClick={() => setSelected(r)}>View run</Button></div></TableCell></TableRow>)}
        {!data?.items.length && <TableRow><TableCell colSpan={5} className="h-36 text-center text-muted-foreground">{loading ? "Loading runs…" : "No runs match these filters. Publish a workflow, then upload a resume or start a run with an existing CV."}</TableCell></TableRow>}
      </TableBody></Table></div><div className="flex items-center justify-between gap-3 border-t p-4 text-sm"><span className="text-muted-foreground">{data?.total ?? 0} runs · Page {page}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page * 20 >= (data?.total ?? 0) || loading} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
    </CardContent></Card>
    <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><SheetContent className="w-full overflow-y-auto sm:max-w-md"><SheetHeader><SheetTitle>Run details</SheetTitle><SheetDescription>{selected?.candidateName} · Version {selected?.version}</SheetDescription></SheetHeader>{selected && <div className="space-y-6 p-5"><RunBadge status={selected.status} waitingFor={selected.context.waitingFor} /><p className="break-all text-xs text-muted-foreground">Run ID: {selected.id}</p><ol className="space-y-5">{selected.graph.nodes.filter(n => n.kind !== "stop" || selected.context.steps[n.id]).map(n => { const result = selected.context.steps[n.id]; const Icon = result?.status === "completed" ? CheckCircle2 : result?.status === "failed" ? XCircle : selected.currentNodeId === n.id ? Clock3 : Circle; return <li key={n.id} className="flex gap-3"><Icon className={`mt-0.5 size-5 shrink-0 ${result?.status === "completed" ? "text-emerald-600" : result?.status === "failed" ? "text-red-600" : "text-muted-foreground"}`} /><div><p className="text-sm font-medium">{STEP_LABELS[n.kind]}</p><p className="text-xs text-muted-foreground">{result?.note ?? (result?.status === "completed" ? "Completed" : selected.currentNodeId === n.id ? STATUS_LABELS[selected.status] : "Not reached")}</p>{result?.completedAt && <p className="text-xs text-muted-foreground">{runDate(result.completedAt)}</p>}</div></li>; })}</ol>
      {selected.context.reviewer && <div className="rounded-lg border p-3 text-sm"><p>Reviewed by {selected.context.reviewer}</p>{selected.context.reviewNote && <p className="mt-2 text-muted-foreground">{selected.context.reviewNote}</p>}</div>}
      {selected.errorMessage && <Alert variant="destructive"><AlertDescription>{selected.errorMessage}</AlertDescription></Alert>}
      {selected.graph.nodes.some(n=>n.kind === "send_telegram") && (selected.context.waitingFor || selected.status === "completed" || (selected.status === "failed" && selected.graph.nodes.find(n=>n.id === selected.currentNodeId)?.kind === "send_telegram")) && <RunTelegramAction key={selected.id} run={selected} onUpdated={r=>{setSelected(r);void load();}} />}
      {selected.status === "failed" && <div className="space-y-3"><Button disabled={busy} onClick={() => void act("retry")}>{busy && <LoaderCircle className="animate-spin" />} Retry failed step</Button>{selected.graph.nodes.find(n => n.id === selected.currentNodeId)?.kind === "create_account" && <Button variant="outline" disabled={busy} onClick={() => void act("return_review")}>Return to review</Button>}<p className="text-xs text-muted-foreground">Completed steps are preserved. Existing assignments are not duplicated.</p></div>}
      {selected.status === "waiting_review" && <Button asChild><Link href={`/workflows/runs/${selected.id}/review`}>Review CV</Link></Button>}
      <Button asChild variant="outline"><Link href={`/resumes/${selected.resumeId}`}>Open resume</Link></Button>{selected.context.userId && <Button asChild variant="outline"><Link href="/accounts">View accounts</Link></Button>}
    </div>}</SheetContent></Sheet>
  </div>;
}
