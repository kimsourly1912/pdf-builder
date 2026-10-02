"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  FilePenLine,
  LoaderCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import { ArchiveButton } from "@/features/archive/archive-button";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
import {
  TRIGGER_LABELS,
  type WorkflowTrigger,
} from "@/features/workflows/workflow";
import type { ResumeCandidateSummary } from "@/features/resumes/resume.types";
type IntakeData = {
  id: string;
  resumeId: string;
  fileName: string;
  candidate: ResumeCandidateSummary;
  contact: { fullName: string; email: string; username: string };
  accountCreated: boolean;
  possibleDuplicate: boolean;
  confirmed: boolean;
  archived: boolean;
  reviewReady: boolean;
  reviewedAt: string | null;
  resumeRevision: string;
  candidateRevision: string;
  profileVersionId: string | null;
  existingAccount: { id: string; name: string; email: string } | null;
  cvHistory: {
    id: string;
    fileName: string;
    verificationStatus: string;
    archived: number;
    createdAt: string;
  }[];
  runs: {
    id: string;
    workflowId: string;
    status: string;
    errorMessage: string | null;
  }[];
};
export function IntakeDetail({
  displayName,
  intakeId,
}: {
  displayName: string;
  intakeId: string;
}) {
  const [data, setData] = useState<IntakeData | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [runOpen, setRunOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [reuse, setReuse] = useState(false),
    [workflowId, setWorkflowId] = useState(""),
    [workflows, setWorkflows] = useState<
      {
        id: string;
        name: string;
        version: number;
        trigger: WorkflowTrigger;
        hasTelegram?: boolean;
      }[]
    >([]);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await workflowApi<IntakeData>(
          `/api/intake/${intakeId}`,
          { signal },
        );
        if (!signal?.aborted) setData(result);
      } catch (e) {
        if (!signal?.aborted) setError(errorText(e));
      }
    },
    [intakeId],
  );
  useEffect(() => {
    const controller = new AbortController(),
      timer = setTimeout(() => void load(controller.signal), 0);
    void workflowApi<{ items: typeof workflows }>("/api/workflows", {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted)
          setWorkflows(r.items.filter((w) => w.version > 0 && w.hasTelegram));
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  async function start() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const result = await workflowApi<{
        run: { id: string; status: string; errorMessage: string | null };
      }>(`/api/intake/${intakeId}/run`, {
        method: "POST",
        body: JSON.stringify({
          workflowId,
          resumeRevision: data.resumeRevision,
          candidateRevision: data.candidateRevision,
          profileVersionId: data.profileVersionId,
          confirmTelegram: confirmed,
          existingAccountId: reuse ? data.existingAccount?.id : undefined,
        }),
      });
      setRunOpen(false);
      setNotice(
        `Workflow ${result.run.status.replaceAll("_", " ")}.${result.run.errorMessage ? ` ${result.run.errorMessage}` : ""}`,
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const existingRun = data?.runs.find((r) => r.workflowId === workflowId),
    finished =
      existingRun && ["completed", "rejected"].includes(existingRun.status);
  return (
    <AppShell displayName={displayName} fullWidth>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
            href="/intake"
          >
            <ArrowLeft className="size-4" />
            Candidate intake
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {data?.contact.fullName ?? "Candidate overview"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Details received through Telegram. Review and approve the CV in the
            Resume Editor.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
          {data && !data.archived && (
            <ArchiveButton
              type="intake"
              id={data.id}
              label="this intake"
              onArchived={() => void load()}
            />
          )}
        </div>
      </div>
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
      {!data ? (
        <p className="py-20 text-center text-muted-foreground">
          {error ? "Candidate overview unavailable." : "Loading candidate…"}
        </p>
      ) : (
        <>
          {data.archived && (
            <Alert>
              <AlertDescription>
                This CV and intake are archived.{" "}
                <Link className="underline" href="/archive">
                  Open Archive to restore them.
                </Link>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="overflow-hidden p-0">
              <div className="h-[650px] lg:h-[calc(100svh-15rem)] lg:min-h-[560px]">
                <ResumePdfPreview
                  resumeId={data.resumeId}
                  fileName={data.fileName}
                  contained
                  allowDownload={false}
                />
              </div>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Submitted details</CardTitle>
                  <CardDescription>
                    Provided by the candidate through the recruitment bot.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Full name</dt>
                      <dd>{data.contact.fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="break-all">{data.contact.email}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Telegram</dt>
                      <dd>
                        {data.contact.username
                          ? `@${data.contact.username}`
                          : "Connected Telegram user"}
                        <p className="text-xs text-muted-foreground">
                          {data.confirmed
                            ? "HR confirmed"
                            : "Contact confirmation required before invitation"}
                        </p>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Login account</dt>
                      <dd>
                        {data.accountCreated
                          ? "Created / linked"
                          : "Created after verification when the workflow runs"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>HR review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Badge variant={data.reviewReady ? "default" : "secondary"}>
                    {data.reviewReady
                      ? "Verified · ready to run"
                      : "Needs Resume Editor review"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {data.reviewReady
                      ? `Verified in the Resume Editor ${data.reviewedAt ? runDate(data.reviewedAt) : ""}. The workflow will reuse this approval.`
                      : "Open the Resume Editor, check the PDF, enter or correct the candidate details, then save and verify. AI extraction is optional."}
                  </p>
                  {data.reviewReady && (
                    <p className="text-sm">
                      {data.candidate.fullName}
                      <span className="block break-all text-muted-foreground">
                        {data.candidate.email}
                      </span>
                    </p>
                  )}
                  <Button
                    asChild
                    variant={data.reviewReady ? "outline" : "default"}
                    className="w-full"
                  >
                    <Link href={`/resumes/${data.resumeId}`}>
                      <FilePenLine />
                      {data.reviewReady
                        ? "View verified CV"
                        : "Open Resume Editor"}
                    </Link>
                  </Button>
                  {data.possibleDuplicate && (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Resolve the possible duplicate in the Resume Editor
                        before verification. Matching email does not authorize
                        account reuse.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Run workflow</CardTitle>
                  <CardDescription>
                    Use the verified CV to prepare the account, link the resume,
                    assign forms, and send the Telegram invitation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select value={workflowId} onValueChange={setWorkflowId}>
                    <SelectTrigger
                      className="w-full"
                      aria-label="Intake workflow"
                    >
                      <SelectValue placeholder="Choose published workflow" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} ·{" "}
                          {TRIGGER_LABELS[w.trigger ?? "staff_upload"]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {finished ? (
                    <Button asChild className="w-full" variant="outline">
                      <Link
                        href={`/workflows/${workflowId}?tab=runs&run=${existingRun.id}`}
                      >
                        View {existingRun.status} run
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={
                        busy ||
                        data.archived ||
                        !data.reviewReady ||
                        !workflowId
                      }
                      onClick={() => {
                        setConfirmed(data.confirmed);
                        setReuse(
                          !!data.existingAccount &&
                            data.candidate.id !== "" &&
                            data.accountCreated,
                        );
                        setRunOpen(true);
                      }}
                    >
                      <Play />
                      Run workflow
                    </Button>
                  )}
                  {!data.reviewReady && (
                    <p className="text-xs text-muted-foreground">
                      Verify this CV in the Resume Editor to enable Run
                      workflow. AI usage is not required.
                    </p>
                  )}
                  {!workflows.length && (
                    <p className="text-xs text-muted-foreground">
                      Publish a workflow containing a Send Telegram invitation
                      step.{" "}
                      <Link href="/workflows" className="underline">
                        Open Workflows
                      </Link>
                    </p>
                  )}
                  {data.runs.map((run) => (
                    <Link
                      key={run.id}
                      className="block text-sm underline"
                      href={`/workflows/${run.workflowId}?tab=runs&run=${run.id}`}
                    >
                      View run · {run.status.replaceAll("_", " ")}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
          {data.cvHistory.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>CV submission history</CardTitle>
                <CardDescription>
                  Additional and replaced CVs belong to the same Telegram
                  contact. Each CV is reviewed separately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.cvHistory.map((cv) => (
                  <div
                    key={cv.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0"
                  >
                    <Link
                      href={`/intake/${cv.id}`}
                      className="text-sm underline"
                    >
                      {cv.fileName}
                    </Link>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {cv.archived
                          ? "Archived"
                          : cv.verificationStatus === "verified"
                            ? "Verified"
                            : "Needs review"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {runDate(cv.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
      <Dialog
        open={runOpen}
        onOpenChange={(v) => {
          if (!busy) setRunOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run this workflow?</DialogTitle>
            <DialogDescription>
              The CV approval from the Resume Editor is reused. This can create
              or reuse the candidate account, assign forms, and send account
              access to the Telegram contact below.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {data?.candidate.fullName} · {data?.candidate.email}
            <span className="block text-muted-foreground">
              {data?.contact.username
                ? `@${data.contact.username}`
                : "Connected Telegram user"}
            </span>
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            <span>
              I confirmed this Telegram contact belongs to this candidate.
            </span>
          </label>
          {data?.existingAccount && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={reuse}
                onCheckedChange={(v) => setReuse(v === true)}
              />
              <span>
                Reuse the existing account for {data.existingAccount.name} (
                {data.existingAccount.email}).
              </span>
            </label>
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
              onClick={() => setRunOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy || !confirmed || (!!data?.existingAccount && !reuse)
              }
              onClick={() => void start()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Run workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
