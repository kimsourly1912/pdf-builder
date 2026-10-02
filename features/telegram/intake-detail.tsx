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
  progress: {
    label: string;
    next: string;
    href: string;
    fileName: string;
  } | null;
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
  contactRevision: string;
  profileVersionId: string | null;
  existingAccount: { id: string; name: string; email: string } | null;
  cvHistory: {
    id: string;
    fileName: string;
    verificationStatus: string;
    archived: number;
    previouslyApproved: number;
    createdAt: string;
  }[];
  runs: {
    id: string;
    workflowId: string;
    status: string;
    hasPreparation: number;
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
    [contactOpen, setContactOpen] = useState(false),
    [runOpen, setRunOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [reuse, setReuse] = useState(false),
    [automatic, setAutomatic] = useState(false),
    [workflowId, setWorkflowId] = useState(""),
    [workflows, setWorkflows] = useState<
      {
        id: string;
        name: string;
        version: number;
        trigger: WorkflowTrigger;
        hasTelegram?: boolean;
        active: boolean;
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
        if (!controller.signal.aborted) {
          setAutomatic(
            r.items.some(
              (w) =>
                w.active && w.version > 0 && w.trigger === "resume_verified",
            ),
          );
          setWorkflows(
            r.items.filter((w) => w.active && w.version > 0 && w.hasTelegram),
          );
        }
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
  async function confirmContact() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/intake/${intakeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "confirm_contact",
          confirm: true,
          contactRevision: data.contactRevision,
          resumeRevision: data.resumeRevision,
          candidateRevision: data.candidateRevision,
        }),
      });
      setContactOpen(false);
      setNotice(
        "Telegram contact confirmed. No invitation or workflow was started.",
      );
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const preparationRuns = data?.runs.filter(
    (r) =>
      r.hasPreparation ||
      !["completed", "rejected", "cancelled"].includes(r.status),
  );
  const existingRun =
    preparationRuns?.find(
      (r) => !["completed", "rejected", "cancelled"].includes(r.status),
    ) ??
    preparationRuns?.find((r) => r.workflowId === workflowId) ??
    preparationRuns?.[0];
  const runLabel =
    existingRun?.status === "completed"
      ? "View completed preparation"
      : existingRun &&
          ["failed", "waiting_review", "rejected", "cancelled"].includes(
            existingRun.status,
          )
        ? "Resolve issue"
        : "View progress";
  const nextAction =
    data?.progress && data.progress.label === "CV approved" && !existingRun
      ? !data.confirmed
        ? { next: "Confirm contact", href: "#contact" }
        : !workflows.length
          ? { next: "Configure workflow", href: "/workflows" }
          : { next: "Prepare candidate", href: "#preparation" }
      : data?.progress;
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCw />
            Refresh
          </Button>
          {data && !data.archived && (
            <>
              <Button asChild variant="outline">
                <Link href={`/candidates/${data.candidate.id}`}>
                  Candidate progress
                </Link>
              </Button>
              <ArchiveButton
                type="intake"
                id={data.id}
                label="this intake"
                onArchived={() => void load()}
              />
            </>
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
            <Card className="order-last overflow-hidden p-0 lg:order-first">
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <span className="min-w-0 break-all font-medium text-sm">
                  {data.fileName}
                </span>
                <Badge variant="outline">Currently viewing</Badge>
                {data.cvHistory[0]?.id === intakeId && (
                  <Badge variant="outline">Latest submission</Badge>
                )}
              </div>
              <div className="h-[650px] lg:h-[calc(100svh-15rem)] lg:min-h-[560px]">
                <ResumePdfPreview
                  resumeId={data.resumeId}
                  fileName={data.fileName}
                  contained
                  allowDownload={false}
                />
              </div>
            </Card>
            <div className="order-first space-y-5 lg:order-last">
              <Card id="contact" className="scroll-mt-24">
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
              {data.progress && (
                <Card>
                  <CardHeader>
                    <CardTitle>Candidate progress</CardTitle>
                    <CardDescription>
                      For {data.progress.fileName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge>{data.progress.label}</Badge>
                    <Button asChild className="w-full" variant="outline">
                      <Link href={nextAction?.href ?? data.progress.href}>
                        {nextAction?.next ?? data.progress.next}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>HR review</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Badge variant={data.reviewReady ? "default" : "secondary"}>
                    {data.reviewReady
                      ? "CV approved"
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
              <Card id="preparation" className="scroll-mt-24">
                <CardHeader>
                  <CardTitle>Preparation</CardTitle>
                  <CardDescription>
                    Use the verified CV to prepare the account, link the resume,
                    assign forms, and send the Telegram invitation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {automatic
                      ? "Approving a CV starts your published CV-approval workflow automatically. Use View progress for an existing preparation."
                      : "No automatic CV-approval workflow is published. After approval, choose a published preparation workflow to start manually."}
                  </p>
                  {!data.confirmed && !data.archived && (
                    <Alert>
                      <AlertDescription>
                        <p>
                          Telegram contact confirmation is required before an
                          invitation.
                        </p>
                        <Button
                          className="mt-2"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setConfirmed(false);
                            setContactOpen(true);
                          }}
                        >
                          Confirm contact
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}
                  {!existingRun && (
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
                  )}
                  {existingRun ? (
                    <Button asChild className="w-full" variant="outline">
                      <Link
                        href={`/workflows/${existingRun.workflowId}?tab=runs&run=${existingRun.id}`}
                      >
                        {runLabel}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={
                        busy ||
                        data.archived ||
                        !data.reviewReady ||
                        !data.confirmed ||
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
                  {!existingRun && !workflows.length && (
                    <p className="text-xs text-muted-foreground">
                      No suitable preparation workflow is published. Configure
                      and publish one containing a Send Telegram invitation
                      step.{" "}
                      <Link href="/workflows" className="underline">
                        Configure workflow
                      </Link>
                    </p>
                  )}
                  {data.runs
                    .filter((run) => run.id !== existingRun?.id)
                    .map((run) => (
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
                {data.cvHistory.map((cv, index) => (
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
                    <div className="flex flex-wrap gap-2">
                      {index === 0 && (
                        <Badge variant="outline">Latest submission</Badge>
                      )}
                      {cv.id === intakeId && (
                        <Badge variant="outline">Currently viewing</Badge>
                      )}
                      {!!cv.previouslyApproved && (
                        <Badge variant="outline">Previously approved</Badge>
                      )}
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
        open={contactOpen}
        onOpenChange={(v) => {
          if (!busy) setContactOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Telegram contact</DialogTitle>
            <DialogDescription>
              Confirm that{" "}
              {data?.contact.username
                ? `@${data.contact.username}`
                : "this connected Telegram user"}{" "}
              belongs to {data?.candidate.fullName || data?.contact.fullName}.
              This does not send account access.
            </DialogDescription>
          </DialogHeader>
          <label className="flex gap-2 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            I checked this contact belongs to the candidate.
          </label>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setContactOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !confirmed}
              onClick={() => void confirmContact()}
            >
              Confirm contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
            <strong className="block">Selected CV: {data?.fileName}</strong>
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
