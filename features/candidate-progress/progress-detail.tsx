"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import {
  STAGE_LABELS,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
import { stageAge, statusColor, runStatusLabel } from "./presentation";
import { candidateNextAction } from "./submission-progress";
import { MoveMenu, MoveDialog } from "./progress-actions";
export function ProgressDetail({
  displayName,
  candidateId,
}: {
  displayName: string;
  candidateId: string;
}) {
  const [item, setItem] = useState<CandidateProgress | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [move, setMove] = useState<{
      item: CandidateProgress;
      stage: CandidateStage;
    } | null>(null);
  const requestVersion = useRef(0);
  const invalidateRequests = useCallback(() => ++requestVersion.current, []);
  const load = useCallback(async () => {
    const version = invalidateRequests();
    try {
      const d = await workflowApi<{ candidate: CandidateProgress }>(
        `/api/candidates/${candidateId}`,
      );
      if (version === requestVersion.current) setItem(d.candidate);
    } catch (e) {
      if (version === requestVersion.current) setError(errorText(e));
    }
  }, [candidateId, invalidateRequests]);
  useEffect(() => {
    const initial = setTimeout(() => {
      if (!busy && !move) void load();
    }, 0);
    const refresh = () => {
      if (!document.hidden && !busy && !move) void load();
    };
    const t = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      invalidateRequests();
      clearTimeout(initial);
      clearInterval(t);
      window.removeEventListener("focus", refresh);
    };
  }, [load, busy, move, invalidateRequests]);
  async function select(action: "select_cv" | "select_run", value: string) {
    if (!item) return;
    invalidateRequests();
    setBusy(true);
    setError("");
    try {
      const d = await workflowApi<{ candidate: CandidateProgress }>(
        `/api/candidates/${candidateId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            action,
            expectedRevision: item.revision,
            ...(action === "select_cv"
              ? { resumeId: value }
              : { runId: value }),
          }),
        },
      );
      invalidateRequests();
      setItem(d.candidate);
    } catch (e) {
      setError(errorText(e));
      void load();
    } finally {
      setBusy(false);
    }
  }
  const preparationUrl = item?.run
    ? `/workflows/${item.run.workflowId}?tab=runs&run=${item.run.id}`
    : item?.selectedCv.intakeId
      ? `/intake/${item.selectedCv.intakeId}`
      : "/workflows";
  return (
    <AppShell displayName={displayName} fullWidth>
      <Link
        className="flex items-center gap-2 text-sm text-muted-foreground"
        href="/candidates"
      >
        <ArrowLeft className="size-4" />
        Candidate progress
      </Link>
      <PageHeader
        title={item?.name ?? "Candidate progress"}
        description={
          item
            ? `${item.email}${item.telegram ? ` · @${item.telegram}` : ""}`
            : "Loading candidate…"
        }
        actions={
          <div className="flex gap-2">
            {item && (
              <MoveMenu
                item={item}
                disabled={busy}
                onMove={(i, s) => setMove({ item: i, stage: s })}
              />
            )}
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw />
              Refresh
            </Button>
          </div>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {item && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={statusColor(STAGE_LABELS[item.stage])}
            >
              {STAGE_LABELS[item.stage]}
            </Badge>
            <span className="self-center text-sm text-muted-foreground">
              {stageAge(item.stage, item.stageSince)}
            </span>
            {item.manual && (
              <Badge variant="outline">
                HR stage · actual progress: {STAGE_LABELS[item.automaticStage]}
              </Badge>
            )}
            <Badge variant="secondary">
              {item.facts.completed}/{item.facts.required} forms submitted
            </Badge>
          </div>
          {item.issues.map((issue) => (
            <Alert key={issue.key}>
              <AlertTriangle />
              <AlertDescription className="space-y-2 break-words">
                <p>{issue.message}</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={issue.href}>{issue.action}</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ))}
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Current preparation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Each preparation uses a specific CV and workflow. Selecting
                    another CV preserves previous accounts, invitations and
                    forms.
                  </p>
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="selected-cv"
                    >
                      Selected CV
                    </label>
                    <Select
                      value={item.selectedCv.id}
                      onValueChange={(v) => void select("select_cv", v)}
                      disabled={busy}
                    >
                      <SelectTrigger
                        id="selected-cv"
                        aria-label="Selected candidate CV"
                        className="w-full min-w-0"
                      >
                        <SelectValue className="min-w-0 flex-1 !block truncate text-left" />
                      </SelectTrigger>
                      <SelectContent>
                        {item.cvs.map((c) => (
                          <SelectItem
                            key={c.id}
                            value={c.id}
                            disabled={c.archived}
                          >
                            {c.fileName} · {runDate(c.receivedAt)}
                            {item.cvs.find((cv) => !cv.archived)?.id === c.id
                              ? " · Latest submission"
                              : ""}
                            {c.archived
                              ? " · Archived"
                              : c.verified
                                ? " · Approved"
                                : " · Needs review"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {item.runs.some(
                    (r) => r.resumeId === item.selectedCv.id && !r.archived,
                  ) && (
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="selected-run"
                      >
                        Selected preparation
                      </label>
                      <Select
                        value={item.run?.id ?? ""}
                        onValueChange={(v) => void select("select_run", v)}
                        disabled={busy}
                      >
                        <SelectTrigger
                          id="selected-run"
                          aria-label="Selected candidate preparation"
                          className="w-full min-w-0"
                        >
                          <SelectValue className="min-w-0 flex-1 !block truncate text-left" />
                        </SelectTrigger>
                        <SelectContent>
                          {item.runs
                            .filter(
                              (r) =>
                                r.resumeId === item.selectedCv.id &&
                                !r.archived,
                            )
                            .map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name} ·{" "}
                                {runStatusLabel(r.status, r.waitingFor)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      [
                        "CV review",
                        item.selectedCv.verified
                          ? "CV approved"
                          : "Needs review",
                      ],
                      [
                        "Login account",
                        item.accountCreated
                          ? "Created / linked"
                          : "Not created",
                      ],
                      [
                        "Preparation",
                        item.run
                          ? runStatusLabel(item.run.status, item.run.waitingFor)
                          : "Not started",
                      ],
                      [
                        "Telegram invitation",
                        item.facts.invitationSent
                          ? "Accepted by Telegram (not a read receipt)"
                          : item.facts.invitationRequired
                            ? "Not sent"
                            : "Not required / not configured",
                      ],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="mt-1 text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      asChild
                      variant={item.selectedCv.verified ? "outline" : "default"}
                    >
                      <Link
                        href={`/resumes/${item.selectedCv.id}?candidateId=${item.id}`}
                      >
                        {item.selectedCv.verified
                          ? "View approved CV"
                          : "Review and approve CV"}
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant={item.selectedCv.verified ? "default" : "outline"}
                    >
                      <Link
                        href={
                          item.run || !item.selectedCv.intakeId
                            ? preparationUrl
                            : candidateNextAction(item).href
                        }
                      >
                        {item.run
                          ? ["failed", "waiting_review"].includes(
                              item.run.status,
                            )
                            ? "Resolve preparation issue"
                            : item.run.status === "completed"
                              ? "View completed preparation"
                              : "View progress"
                          : candidateNextAction(item).next}
                      </Link>
                    </Button>
                    {item.selectedCv.intakeId && (
                      <Button asChild variant="outline">
                        <Link href={`/intake/${item.selectedCv.intakeId}`}>
                          View intake
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle
                    id="required-forms"
                    className="scroll-mt-24"
                    role="heading"
                    aria-level={2}
                  >
                    Required forms
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.forms.map((f) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div>
                        <p className="font-medium text-sm">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.status === "completed"
                            ? "Submitted"
                            : f.status === "assigned"
                              ? "Awaiting candidate"
                              : f.status}
                          {f.reused ? " · Reused assignment" : ""}
                          {f.completedAt ? ` · ${runDate(f.completedAt)}` : ""}
                        </p>
                      </div>
                      {f.status === "completed" && f.url ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={f.url!} target="_blank" rel="noreferrer">
                            View submission PDF
                          </Link>
                        </Button>
                      ) : (
                        <Badge variant="secondary">
                          {f.status === "completed" ? "Submitted" : "Pending"}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {!item.forms.length && (
                    <p className="text-sm text-muted-foreground">
                      {item.run
                        ? "No forms have been assigned for the selected preparation."
                        : "Start preparation to assign the required forms."}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Preparation history
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.runs.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {r.name}
                          {r.id === item.run?.id ? " · Current" : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {runStatusLabel(r.status, r.waitingFor)}
                          {r.archived ? " · Archived" : ""} ·{" "}
                          {runDate(r.createdAt)}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/workflows/${r.workflowId}?tab=runs&run=${r.id}`}
                        >
                          View run
                        </Link>
                      </Button>
                    </div>
                  ))}
                  {!item.runs.length && (
                    <p className="text-sm text-muted-foreground">
                      No preparation has started.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Progress timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-5">
                  {item.activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{a.action}</p>
                        {typeof a.metadata.from === "string" &&
                          typeof a.metadata.to === "string" && (
                            <p className="text-xs">
                              {a.metadata.from} → {a.metadata.to}
                            </p>
                          )}
                        {typeof a.metadata.reason === "string" &&
                          a.metadata.reason && (
                            <p className="mt-1 break-words text-xs">
                              {a.metadata.reason}
                            </p>
                          )}
                        <p className="break-all text-xs text-muted-foreground">
                          {a.actor} · {runDate(a.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <MoveDialog
        key={move ? `${move.item.id}:${move.stage}` : "closed"}
        move={move}
        onClose={() => setMove(null)}
        onChanged={() => void load()}
      />
    </AppShell>
  );
}
