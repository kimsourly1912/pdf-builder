"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import { formApi } from "@/features/forms/client";
export type Review = {
  id: string;
  templateId: string;
  templateName: string;
  kind: string;
  versionId: string;
  versionNumber: number;
  name: string;
  email: string;
  submittedAt: string;
  answers: Array<{
    fieldId: string;
    key: string;
    label: string;
    type: string;
    value: unknown;
    displayValue?: string;
  }>;
  pdfStatus: string;
  pdfError: string | null;
  reviewStatus: string;
  reason: string;
  revision: string;
  reviewedAt: string | null;
  canRequestCorrections: boolean;
  candidate: { id: string; name: string } | null;
  previous: { id: string; at: string; reason: string } | null;
  next: { id: string } | null;
};
export function reviewLabel(status: string) {
  return status === "accepted"
    ? "Accepted by HR"
    : status === "corrections_requested"
      ? "Corrections requested"
      : "Awaiting HR review";
}
export function AnswerSummary({ answers }: { answers: Review["answers"] }) {
  return (
    <dl className="space-y-5">
      {answers.map((a) => (
        <div key={a.fieldId}>
          <dt className="text-sm font-medium">{a.label || a.key}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {a.displayValue ??
              (a.value &&
              typeof a.value === "object" &&
              !Array.isArray(a.value) ? (
                <a
                  className="text-primary underline"
                  href={String((a.value as { url?: string }).url ?? "")}
                  target="_blank"
                  rel="noreferrer"
                >
                  View uploaded image
                </a>
              ) : Array.isArray(a.value) ? (
                a.value.join(", ")
              ) : typeof a.value === "boolean" ? (
                a.value ? (
                  "Yes"
                ) : (
                  "No"
                )
              ) : (
                String(a.value ?? "—")
              ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function SubmissionReview({
  id,
  displayName,
}: {
  id: string;
  displayName: string;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dialog, setDialog] = useState<"accept" | "request_corrections" | null>(
      null,
    ),
    [reason, setReason] = useState(""),
    [notice, setNotice] = useState(""),
    [assignmentUrl, setAssignmentUrl] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const data = await formApi<{ review: Review }>(
        `/api/submissions/${id}/review`,
      );
      setReview(data.review);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load submission.");
    }
  }, [id]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function decide() {
    if (!review || !dialog) return;
    setBusy(true);
    setError("");
    try {
      const data = await formApi<{
        review: Review;
        assignmentUrl: string | null;
      }>(`/api/submissions/${id}/review`, {
        method: "POST",
        body: JSON.stringify({
          action: dialog,
          reason,
          expectedRevision: review.revision,
        }),
      });
      setReview(data.review);
      setAssignmentUrl(data.assignmentUrl);
      setDialog(null);
      setReason("");
      setNotice(
        data.assignmentUrl
          ? "Correction attempt is available in the candidate’s My forms. Share the link if needed; no message was sent automatically."
          : "Submission accepted. Original answers and PDF are preserved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + assignmentUrl,
      );
      setNotice("Correction link copied.");
    } catch {
      setError("Copy failed. Use Open correction form to access the link.");
    }
  }
  async function retry() {
    setBusy(true);
    try {
      await formApi(`/api/forms/submissions/${id}/pdf`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF retry failed.");
    } finally {
      setBusy(false);
    }
  }
  function exportJson() {
    if (!review) return;
    const data = {
      submissionId: id,
      templateId: review.templateId,
      versionId: review.versionId,
      versionNumber: review.versionNumber,
      email: review.email,
      submittedAt: review.submittedAt,
      reviewStatus: review.reviewStatus,
      answers: Object.fromEntries(review.answers.map((a) => [a.key, a.value])),
      fields: review.answers,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `response-${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <AppShell displayName={displayName}>
      <div className="flex flex-wrap gap-3 text-sm text-primary">
        {review?.candidate && (
          <Link
            className="underline"
            href={`/candidates/${review.candidate.id}?tab=forms`}
          >
            ← {review.candidate.name} · Forms
          </Link>
        )}
        <Link
          className="underline"
          href={
            review?.kind === "pdf"
              ? "/templates"
              : review
                ? `/forms/${review.templateId}/responses`
                : "/forms"
          }
        >
          All responses
        </Link>
      </div>
      <PageHeader
        title={review?.templateName ?? "Review submitted form"}
        description={
          review
            ? `${review.name} · ${review.email} · Version ${review.versionNumber} · ${new Date(review.submittedAt).toLocaleString()}`
            : "Loading submission…"
        }
        actions={
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <p role="status" className="rounded-lg border p-4 text-sm">
          {notice}
        </p>
      )}
      {review && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{reviewLabel(review.reviewStatus)}</Badge>
            <Button variant="outline" onClick={exportJson}>
              Export JSON
            </Button>
            {assignmentUrl && (
              <>
                <Button variant="outline" onClick={() => void copy()}>
                  Copy correction link
                </Button>
                <Button asChild variant="outline">
                  <Link href={assignmentUrl}>Open correction form</Link>
                </Button>
              </>
            )}
          </div>
          {review.reason && (
            <div className="rounded-lg border p-4">
              <h2 className="font-medium">HR feedback</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {review.reason}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-sm text-primary">
            {review.previous && (
              <Link
                className="underline"
                href={`/submissions/${review.previous.id}/review`}
              >
                View original submission and correction request
              </Link>
            )}
            {review.next && (
              <Link
                className="underline"
                href={`/submissions/${review.next.id}/review`}
              >
                Review corrected submission
              </Link>
            )}
          </div>
          <div className="grid min-w-0 gap-6 lg:grid-cols-2">
            <section className="min-w-0 rounded-xl border bg-card p-5">
              <h2 className="mb-5 font-semibold">Submitted answers</h2>
              <AnswerSummary answers={review.answers} />
            </section>
            <section className="min-w-0">
              <h2 className="mb-3 font-semibold">Completed PDF</h2>
              {review.pdfStatus === "ready" ? (
                <ResumePdfPreview
                  resumeId={id}
                  fileName={`${review.templateName}.pdf`}
                  url={`/api/submissions/${id}/pdf`}
                  contained
                />
              ) : (
                <div className="space-y-3 rounded-xl border bg-card p-5">
                  <p className="text-sm text-muted-foreground">
                    {review.pdfStatus === "not_configured"
                      ? "This form collects answers without a PDF. All answers are available here and in JSON."
                      : review.pdfError === "text_overflow"
                        ? "An answer exceeds its published PDF placement. JSON is complete. Update the template for future assignments; retrying this version cannot change its layout."
                        : "The PDF is preparing or needs a retry. Submitted answers are already saved."}
                  </p>
                  {review.kind === "form" &&
                    review.pdfStatus !== "not_configured" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void retry()}
                      >
                        Retry PDF generation
                      </Button>
                    )}
                </div>
              )}
            </section>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Original submissions remain in history. Acceptance confirms the
              form, not a hiring decision.
            </p>
            {review.reviewStatus === "pending" && (
              <div className="flex flex-wrap gap-2">
                {review.canRequestCorrections && (
                  <Button
                    variant="outline"
                    onClick={() => setDialog("request_corrections")}
                  >
                    Request corrections
                  </Button>
                )}
                <Button onClick={() => setDialog("accept")}>
                  Accept submission
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!busy && !open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "accept"
                ? "Accept this submission?"
                : "Request corrections"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "accept"
                ? "Confirm you reviewed the answers. This decision is recorded separately from the original submission."
                : "The candidate will receive a new attempt in My forms using the same published version. Original answers and PDF stay saved. Photos and signatures must be uploaded again. This does not send a Telegram message."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "request_corrections" && (
            <div className="space-y-2">
              <Label htmlFor="correction-reason">
                What should the candidate correct?
              </Label>
              <Textarea
                id="correction-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                rows={5}
              />
            </div>
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
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                (dialog === "request_corrections" && reason.trim().length < 3)
              }
              onClick={() => void decide()}
            >
              {busy
                ? "Saving…"
                : dialog === "accept"
                  ? "Accept submission"
                  : "Create correction attempt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
