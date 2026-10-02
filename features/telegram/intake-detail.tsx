"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { workflowApi, errorText } from "@/features/workflows/client";
import { INTAKE_LABELS, type IntakeStatus } from "./intake-dashboard";
import type { ResumeCandidateSummary } from "@/features/resumes/resume.types";
type IntakeData = {
  id: string;
  resumeId: string;
  fileName: string;
  extractionStatus: IntakeStatus;
  candidate: ResumeCandidateSummary;
  contact: { fullName: string; email: string; username: string };
  accountCreated: boolean;
  possibleDuplicate: boolean;
  confirmed: boolean;
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
    [confirmOpen, setConfirmOpen] = useState(false),
    [workflowId, setWorkflowId] = useState(""),
    [workflows, setWorkflows] = useState<
      { id: string; name: string; version: number; hasTelegram?: boolean }[]
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
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 0);
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
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const processing = data?.extractionStatus === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [processing, load]);
  async function extract() {
    setBusy(true);
    setError("");
    setConfirmOpen(false);
    try {
      await workflowApi(`/api/intake/${intakeId}/extract`, {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          reextract: data?.extractionStatus === "extracted",
        }),
      });
      setNotice(
        "AI extraction completed. Review the results before creating an account.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      await load();
    }
  }
  async function start() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const result = await workflowApi<{ runId: string }>(
        "/api/workflow-runs",
        {
          method: "POST",
          body: JSON.stringify({ workflowId, resumeId: data.resumeId }),
        },
      );
      window.location.assign(`/workflows/runs/${result.runId}/review`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <AppShell displayName={displayName} fullWidth>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
            href="/intake"
          >
            <ArrowLeft className="size-4" /> Candidate intake
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {data?.contact.fullName ?? "Candidate details"}
          </h1>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCw /> Reload
        </Button>
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
          {error ? "Candidate intake unavailable." : "Loading candidate…"}
        </p>
      ) : (
        <>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="overflow-hidden p-0">
              <div className="border-b p-4 font-medium">{data.fileName}</div>
              <div className="h-[650px] lg:h-[calc(100svh-15rem)] lg:min-h-[560px]">
                <ResumePdfPreview
                  resumeId={data.resumeId}
                  fileName={data.fileName}
                  contained
                />
              </div>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Contact summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Full name</dt>
                    <dd>{data.contact.fullName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      Email provided by candidate
                    </dt>
                    <dd className="break-all">{data.contact.email}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Telegram</dt>
                    <dd>
                      {data.contact.username
                        ? `@${data.contact.username}`
                        : "Connected Telegram user"}{" "}
                      ·{" "}
                      {data.confirmed
                        ? "HR confirmed"
                        : "Confirmation required during review"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">AI status</dt>
                    <dd>
                      <Badge variant="secondary">
                        {INTAKE_LABELS[data.extractionStatus]}
                      </Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Login account</dt>
                    <dd>
                      {data.accountCreated ? "Created / linked" : "Not created"}
                    </dd>
                  </div>
                </dl>
                <Button
                  className="w-full"
                  disabled={busy || processing}
                  onClick={() => setConfirmOpen(true)}
                >
                  {busy || processing ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Sparkles />
                  )}
                  {data.extractionStatus === "extracted"
                    ? "Re-extract with AI"
                    : "Extract with AI"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Uses paid AI processing and requires confirmation. Successful
                  extraction is reused when a workflow starts.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <a href={`/api/resumes/${data.resumeId}/download`} download>
                    <Download /> Download CV
                  </a>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/resumes/${data.resumeId}`}>
                    Review / edit in Resume Library
                  </Link>
                </Button>
                {data.possibleDuplicate && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Possible duplicate. Resolve the candidate link in the
                      Resume Library before approval. Matching email alone does
                      not authorize account reuse.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-3 border-t pt-4">
                  <h2 className="font-medium">Start HR review workflow</h2>
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
                          {w.name} · v{w.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    disabled={
                      busy ||
                      data.extractionStatus !== "extracted" ||
                      !workflowId
                    }
                    onClick={() => void start()}
                  >
                    Review extracted CV
                  </Button>
                  {!workflows.length && (
                    <p className="text-xs text-muted-foreground">
                      Publish a workflow with a Send Telegram invitation step
                      first.{" "}
                      <Link className="underline" href="/workflows">
                        Open Workflows
                      </Link>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Approval is required before login account creation, form
                    assignment, or Telegram account access.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {data?.extractionStatus === "extracted"
                ? "Re-extract this CV with AI?"
                : "Extract this CV with AI?"}
            </DialogTitle>
            <DialogDescription>
              This uses paid AI processing. You can preview the PDF first.
              {data?.extractionStatus === "extracted"
                ? " A successful extraction already exists. Re-extracting makes another paid request."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void extract()}>
              Confirm extraction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
