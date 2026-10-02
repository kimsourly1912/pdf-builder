"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Workflow, LoaderCircle } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowRunsView } from "./workflow-runs";
import { workflowApi, errorText, runDate } from "./client";
import type { WorkflowSummary } from "./workflow";

export function WorkflowList(props: { displayName: string }) {
  const [items, setItems] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const data = await workflowApi<{ items: WorkflowSummary[] }>("/api/workflows"); setItems(data.items); setError(""); }
    catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function create() {
    setBusy(true); setError("");
    try { const data = await workflowApi<{ workflow: WorkflowSummary }>("/api/workflows", { method: "POST" }); window.location.assign(`/workflows/${data.workflow.id}`); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return <AppShell displayName={props.displayName} fullWidth>
    <PageHeader title="Workflows" description="Automate candidate preparation after your team uploads a resume." actions={<Button disabled={busy} onClick={() => void create()}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} New workflow</Button>} />
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Tabs defaultValue="workflows"><TabsList><TabsTrigger value="workflows">Workflows</TabsTrigger><TabsTrigger value="runs">All runs</TabsTrigger></TabsList>
      <TabsContent value="workflows" className="mt-5">
        {loading ? <p className="py-12 text-center text-muted-foreground">Loading workflows…</p> : !items.length ? <Card><CardContent className="flex flex-col items-center gap-4 py-16 text-center"><Workflow className="size-10 text-muted-foreground" /><div><h2 className="font-semibold">Create your first candidate workflow</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Start with extraction, manual CV review, account creation, resume linking, and form assignment.</p></div><Button onClick={() => void create()} disabled={busy}><Plus /> Create workflow</Button></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(w => <Card key={w.id}><CardHeader><div className="flex items-center justify-between"><Workflow className="size-5 text-muted-foreground" /><Badge variant={w.active ? "default" : "secondary"}>{w.active ? "Published" : w.version ? "Paused" : "Draft"}</Badge></div><CardTitle className="mt-3">{w.name}</CardTitle><CardDescription>{w.version ? `Version ${w.version} · ` : ""}Updated {runDate(w.updatedAt)}</CardDescription></CardHeader><CardContent><Button asChild variant="outline" className="w-full"><Link href={`/workflows/${w.id}`}>Open workflow</Link></Button></CardContent></Card>)}</div>}
      </TabsContent><TabsContent value="runs" className="mt-5"><WorkflowRunsView /></TabsContent>
    </Tabs>
  </AppShell>;
}
