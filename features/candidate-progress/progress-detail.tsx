"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import { ResumeDetailView } from "@/features/resumes/resume-detail";
import { DISCARD_EDITS } from "@/features/resumes/use-unsaved-changes";
import { CandidateForms } from "@/features/hr/candidate-forms";
import {
  CandidatePreparation,
  ConfirmCandidateContact,
} from "@/features/hr/candidate-preparation";
import {
  STAGE_LABELS,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
import { stageAge, statusColor, runStatusLabel } from "./presentation";
import { candidateNextAction } from "./submission-progress";
import { MoveMenu, MoveDialog } from "./progress-actions";
const PROFILE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "CV & documents" },
  { id: "forms", label: "Forms" },
  { id: "communication", label: "Communication" },
  { id: "history", label: "History" },
];
export function ProgressDetail({
  displayName,
  candidateId,
}: {
  displayName: string;
  candidateId: string;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const requested = search.get("tab"),
    tab = PROFILE_TABS.some((t) => t.id === requested)
      ? requested!
      : "overview";
  const [item, setItem] = useState<CandidateProgress | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [move, setMove] = useState<{
      item: CandidateProgress;
      stage: CandidateStage;
    } | null>(null);
  const requestVersion = useRef(0);
  const invalidate = useCallback(() => ++requestVersion.current, []);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const data = await workflowApi<{ candidate: CandidateProgress }>(
        `/api/candidates/${candidateId}`,
      );
      if (version === requestVersion.current) {
        setItem(data.candidate);
        setError("");
      }
    } catch (e) {
      if (version === requestVersion.current) { setError(errorText(e)); if(errorText(e).includes("active CV not found"))setItem(null); }
    }
  }, [candidateId]);
  useEffect(() => {
    const initial = setTimeout(() => {
      if (!busy && !move) void load();
    }, 0);
    const refresh = () => {
      if (!document.hidden && !busy && !move) void load();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      invalidate();
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, busy, move, invalidate]);
  function leaveDraft() {
    if (dirty && !window.confirm(DISCARD_EDITS)) return false;
    setDirty(false);
    return true;
  }
  function changeTab(value: string) {
    if (value === tab || !leaveDraft()) return;
    router.replace(`/candidates/${candidateId}?tab=${value}`, {
      scroll: false,
    });
  }
  async function select(action: "select_cv" | "select_run", value: string) {
    if (!item || !leaveDraft()) return;
    ++requestVersion.current;
    setBusy(true);
    setError("");
    try {
      const data = await workflowApi<{ candidate: CandidateProgress }>(
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
      ++requestVersion.current;
      setItem(data.candidate);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const runUrl = item?.run
    ? `/workflows/${item.run.workflowId}?tab=runs&run=${item.run.id}`
    : "/workflows";
  function nextAction() {
    if (!item) return null;
    if (!item.selectedCv.verified)
      return <Button onClick={() => changeTab("documents")}>Review CV</Button>;
    const issue = item.issues[0];
    if (issue?.key === "contact" && item.selectedCv.intakeId)
      return (
        <ConfirmCandidateContact item={item} onChanged={() => void load()} />
      );
    if (issue?.key === "new_cv")
      return (
        <Button onClick={() => changeTab("documents")}>
          Review latest submission
        </Button>
      );
    if (issue)
      return (
        <Button asChild>
          <Link href={issue.href}>{issue.action}</Link>
        </Button>
      );
    if (
      item.run &&
      ["queued", "running", "waiting_review", "failed"].includes(
        item.run.status,
      )
    )
      return (
        <Button asChild>
          <Link href={runUrl}>{candidateNextAction(item).next}</Link>
        </Button>
      );
    if (!item.facts.preparationCurrent)
      return item.accountCreated ? (
        <Button onClick={() => changeTab("forms")}>Assign forms</Button>
      ) : (
        <CandidatePreparation item={item} onChanged={() => void load()} />
      );
    return (
      <Button onClick={() => changeTab("forms")}>
        {item.automaticStage === "ready"
          ? "Review submitted forms"
          : item.automaticStage === "accepted"
            ? "View accepted documents"
            : "Check form completion"}
      </Button>
    );
  }
  return (
    <AppShell displayName={displayName}>
      <Link
        href="/candidates"
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        All candidates
      </Link>
      <PageHeader
        title={item?.name ?? "Candidate profile"}
        description={
          item
            ? `${item.email}${item.telegram ? ` · @${item.telegram}` : ""}`
            : "Loading candidate…"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {item && (
              <MoveMenu
                item={item}
                disabled={busy}
                onMove={(i, s) => setMove({ item: i, stage: s })}
              />
            )}
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={busy}
            >
              <RefreshCw />
              Refresh
            </Button>
          </div>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}{error.includes("active CV not found") && <Button asChild variant="outline" className="mt-3"><Link href="/archive">Open archive to restore a CV</Link></Button>}</AlertDescription>
        </Alert>
      )}
      {!item && !error && <p role="status">Loading candidate profile…</p>}
      {item && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={statusColor(STAGE_LABELS[item.stage])}
            >
              {STAGE_LABELS[item.stage]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {stageAge(item.stage, item.stageSince)}
            </span>
            {item.manual && (
              <Badge variant="outline">
                HR stage · actual: {STAGE_LABELS[item.automaticStage]}
              </Badge>
            )}
            <Badge variant="secondary">
              {item.facts.completed}/{item.facts.required} required forms
              submitted
            </Badge>
          </div>
          <Tabs value={tab} onValueChange={changeTab}>
            <div className="min-w-0 overflow-x-auto pb-1">
              <TabsList variant="line" className="w-max">
                {PROFILE_TABS.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="overview" className="mt-5 space-y-5">
              <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle role="heading" aria-level={2}>
                      Next action
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {!item.selectedCv.verified
                        ? "Check the candidate’s details against the selected CV. Save unfinished work or explicitly approve the information. AI extraction is optional."
                        : item.automaticStage === "accepted"
                          ? "HR accepted all required documents. This is document completion, not a hiring decision."
                          : item.automaticStage === "ready"
                            ? "Required forms are submitted. Review their answers, accept each form or request corrections."
                            : (item.issues[0]?.message ??
                              (!item.facts.preparationCurrent
                                ? "CV information is approved. Prepare account access and assign onboarding forms."
                                : "Preparation and form completion are tracked here. Open Forms to see what is still missing."))}
                    </p>
                    {nextAction()}
                    <p className="text-xs text-muted-foreground">
                      CV approval may start your published approval workflow
                      automatically.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle role="heading" aria-level={2}>
                      Status summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="space-y-3">
                      {[
                        [
                          "Contact",
                          item.contactConfirmed
                            ? "Telegram confirmed"
                            : item.selectedCv.intakeId
                              ? "Telegram confirmation needed"
                              : "No Telegram submission",
                        ],
                        [
                          "CV information",
                          item.selectedCv.verified
                            ? "Approved"
                            : "Needs review",
                        ],
                        [
                          "Account access",
                          item.accountDisabled
                            ? "Disabled"
                            : item.accountCreated
                              ? "Created / linked"
                              : "Not created",
                        ],
                        [
                          "Preparation",
                          item.run
                            ? runStatusLabel(
                                item.run.status,
                                item.run.waitingFor,
                              )
                            : item.facts.preparationCurrent
                              ? "Forms assigned manually"
                              : "Not started",
                        ],
                        [
                          "Required forms",
                          `${item.facts.completed}/${item.facts.required} submitted · ${item.facts.accepted ?? 0} accepted`,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0"
                        >
                          <dt className="text-sm text-muted-foreground">
                            {label}
                          </dt>
                          <dd className="text-sm font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {item.accountId && (
                      <Button asChild variant="outline" className="mt-4">
                        <Link
                          href={`/accounts?${new URLSearchParams({ account: item.accountId, search: item.accountEmail ?? item.email })}`}
                        >
                          Manage account access
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>
              {item.issues.map((issue) => (
                <Alert key={issue.key}>
                  <AlertTriangle />
                  <AlertDescription>
                    <p>{issue.message}</p>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="mt-3"
                    >
                      <Link href={issue.href}>{issue.action}</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              ))}
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Current preparation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="break-words text-sm">
                    Selected CV: <strong>{item.selectedCv.fileName}</strong>
                  </p>
                  {item.runs.some(
                    (r) => r.resumeId === item.selectedCv.id && !r.archived,
                  ) && (
                    <div className="space-y-2">
                      <label
                        htmlFor="selected-run"
                        className="text-sm font-medium"
                      >
                        Preparation to track
                      </label>
                      <Select
                        value={item.run?.id ?? ""}
                        onValueChange={(v) => {
                          if (v) void select("select_run", v);
                        }}
                        disabled={busy}
                      >
                        <SelectTrigger
                          id="selected-run"
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
                  <p className="text-xs text-muted-foreground">
                    Each preparation uses a specific approved CV. Changing the
                    selected CV preserves earlier assignments and history.
                  </p>
                  {item.run ? (
                    <Button asChild variant="outline">
                      <Link href={runUrl}>View preparation details</Link>
                    </Button>
                  ) : (
                    item.selectedCv.verified && (
                      <CandidatePreparation
                        item={item}
                        onChanged={() => void load()}
                      />
                    )
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="documents" className="mt-5 space-y-5">
              <section className="rounded-xl border bg-card p-5">
                <label htmlFor="selected-cv" className="text-sm font-medium">
                  Currently viewing CV
                </label>
                <Select
                  value={item.selectedCv.id}
                  onValueChange={(v) => {
                    if (v) void select("select_cv", v);
                  }}
                  disabled={busy}
                >
                  <SelectTrigger
                    id="selected-cv"
                    aria-label="Selected candidate CV"
                    className="mt-2 w-full min-w-0"
                  >
                    <SelectValue className="min-w-0 flex-1 !block truncate text-left" />
                  </SelectTrigger>
                  <SelectContent>
                    {item.cvs.map((c) => (
                      <SelectItem key={c.id} value={c.id} disabled={c.archived}>
                        {c.fileName} ·{" "}
                        {item.cvs.find((cv) => !cv.archived)?.id === c.id
                          ? "Latest submission · "
                          : ""}
                        {c.archived
                          ? "Archived"
                          : c.verified
                            ? "Approved"
                            : "Needs review"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-3 break-words text-sm text-muted-foreground">
                  {item.selectedCv.fileName} · Received{" "}
                  {runDate(item.selectedCv.receivedAt)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  CV approval verifies information. It does not mark the
                  candidate as hired.
                </p>
              </section>
              <ResumeDetailView
                key={item.selectedCv.id}
                resumeId={item.selectedCv.id}
                embedded
                onChanged={() => void load()}
                onDirtyChange={setDirty}
              />
            </TabsContent>
            <TabsContent value="forms" className="mt-5">
              <CandidateForms item={item} onChanged={() => void load()} />
            </TabsContent>
            <TabsContent value="communication" className="mt-5 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Contact & invitation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">
                        Email provided by candidate
                      </dt>
                      <dd className="break-all">
                        {item.email || "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Telegram</dt>
                      <dd>
                        {item.telegram
                          ? `@${item.telegram}`
                          : item.selectedCv.intakeId
                            ? "Connected Telegram user"
                            : "Not connected"}
                        {item.selectedCv.intakeId
                          ? item.contactConfirmed
                            ? " · HR confirmed"
                            : " · Needs confirmation"
                          : ""}
                      </dd>
                    </div>
                  </dl>
                  {item.selectedCv.intakeId && !item.contactConfirmed && (
                    <ConfirmCandidateContact
                      item={item}
                      onChanged={() => void load()}
                    />
                  )}
                  <p className="text-sm text-muted-foreground">
                    Sent means Telegram accepted the message. It does not mean
                    the candidate read it. Uncertain delivery must be checked
                    before resending.
                  </p>
                  {(item.invitations ?? []).map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                    >
                      <span>
                        {d.status === "sent"
                          ? "Invitation sent"
                          : d.status === "uncertain"
                            ? "Delivery uncertain — check before resending"
                            : `Invitation ${d.status}`}
                      </span>
                      <span className="text-muted-foreground">
                        {runDate(d.at)}
                      </span>
                    </div>
                  ))}
                  {!item.invitations?.length && (
                    <p className="text-sm text-muted-foreground">
                      No invitation recorded for the selected preparation.
                    </p>
                  )}
                  {item.run && (
                    <Button asChild variant="outline">
                      <Link href={runUrl}>View delivery details</Link>
                    </Button>
                  )}
                  {item.selectedCv.intakeId && (
                    <Button asChild variant="outline">
                      <Link href={`/intake/${item.selectedCv.intakeId}`}>
                        Original intake details
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history" className="mt-5 space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Candidate timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-5">
                    {item.activity.map((a) => (
                      <li key={a.id} className="flex gap-3">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{a.action}</p>
                          {typeof a.metadata.from === "string" &&
                            typeof a.metadata.to === "string" && (
                              <p className="text-xs">
                                {a.metadata.from} → {a.metadata.to}
                              </p>
                            )}
                          {typeof a.metadata.reason === "string" &&
                            a.metadata.reason && (
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                                {a.metadata.reason}
                              </p>
                            )}
                          <p className="break-words text-xs text-muted-foreground">
                            {a.actor} · {runDate(a.at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle role="heading" aria-level={2}>
                    Preparation history
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {item.runs.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap justify-between gap-3 border-b pb-3 last:border-0"
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
            </TabsContent>
          </Tabs>
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
