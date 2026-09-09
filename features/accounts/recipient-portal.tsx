"use client";

import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import {
  formatLocalDateTime,
  resolvedLocalTimeZone,
} from "@/features/templates/date-time";

type PortalAssignment = {
  id: string;
  templateName: string;
  description: string;
  versionNumber: number;
  roleName: string;
  roleColor: string;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  url: string | null;
};

export function RecipientPortal(props: {
  displayName: string;
  email: string;
  accountType: string;
}) {
  const [assignments, setAssignments] = useState<PortalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/portal/assignments", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        assignments?: PortalAssignment[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Assigned forms could not be loaded.");
      }
      setAssignments(payload.assignments ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assigned forms could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimeZone(resolvedLocalTimeZone());
      void loadAssignments();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAssignments]);

  const activeCount = assignments.filter((item) => item.status === "active").length;
  return (
    <main className="min-h-[100dvh] bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0"><p className="text-sm font-bold">PDF Builder</p><p className="truncate text-xs text-slate-400">{props.displayName} · {props.accountType}</p></div>
          <SignOutButton />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-bold tracking-tight">My assigned forms</h1><p className="mt-1 text-sm text-slate-500">Signed in as {props.email}</p></div>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadAssignments()}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-2xl font-bold tabular-nums">{activeCount}</p><p className="text-xs font-medium text-slate-400">Forms waiting for submission</p></div>
        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">{error}</p>}
        {loading ? <div className="flex min-h-64 items-center justify-center text-slate-400"><LoaderCircle className="size-6 animate-spin" /></div> : assignments.length === 0 ? <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white text-center"><ClipboardList className="size-7 text-slate-400" /><p className="mt-4 text-sm font-bold text-slate-700">No forms assigned yet</p><p className="mt-1 text-xs text-slate-400">New assignments will appear here.</p></div> : <div className="mt-5 grid gap-4 md:grid-cols-2">{assignments.map((assignment) => <article key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: assignment.roleColor }} /><div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold">{assignment.templateName}</h2><p className="mt-1 text-xs text-slate-400">Version {assignment.versionNumber} · {assignment.roleName}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${assignment.status === "active" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{assignment.status}</span></div>{assignment.description && <p className="mt-4 text-sm leading-6 text-slate-600">{assignment.description}</p>}<p className="mt-4 text-xs text-slate-400">Assigned {formatLocalDateTime(assignment.assignedAt, { timeZone })}</p>{assignment.url ? <Button asChild className="mt-4 w-full bg-blue-600 hover:bg-blue-700"><a href={assignment.url}><ExternalLink className="size-4" /> Open form</a></Button> : <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" /> Submitted{assignment.completedAt ? ` ${formatLocalDateTime(assignment.completedAt, { timeZone })}` : ""}</div>}</article>)}</div>}
      </div>
    </main>
  );
}
