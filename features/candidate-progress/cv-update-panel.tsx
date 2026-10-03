"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import { ResumeDetailView } from "@/features/resumes/resume-detail";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { CandidateProgress } from "./progress";

export function CvUpdatePanel({
  item,
  onChanged,
  onDirtyChange,
  canOpenReview,
  onReviewingChange,
}: {
  item: CandidateProgress;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  canOpenReview: () => boolean;
  onReviewingChange: (reviewing: boolean) => void;
}) {
  const [reviewId, setReviewId] = useState<string | null>(null),
    [declineId, setDeclineId] = useState<string | null>(null);
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const updates = item.cvUpdates ?? [];
  const current = item.currentCv ?? item.selectedCv;
  const reviewing = updates.find((u) => u.resumeId === reviewId);
  const previous =
    item.cvs.find((c) => c.id === reviewing?.baseResumeId) ?? current;
  async function decline() {
    const update = updates.find((u) => u.resumeId === declineId);
    if (!update) return;
    setBusy(true);
    setError("");
    try {
      const { resume } = await workflowApi<{
        resume: {
          updatedAt: string;
          candidateRevision: string;
          cvUpdate: { revision: string };
        };
      }>(`/api/resumes/${update.resumeId}`);
      if (resume.cvUpdate.revision !== update.updatedAt)
        throw new Error(
          "This update changed. Refresh before keeping the current CV.",
        );
      await workflowApi(`/api/resumes/${update.resumeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "decline_update",
          reason,
          updateRevision: update.updatedAt,
          resumeRevision: resume.updatedAt,
          candidateRevision: resume.candidateRevision,
        }),
      });
      setDeclineId(null);
      setReviewId(null);
      onReviewingChange(false);
      onDirtyChange(false);
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function openReview(id: string | null) {
    if (!canOpenReview()) return;
    setDirty(false);
    onDirtyChange(false);
    setReviewId(id);
    onReviewingChange(!!id);
  }
  return (
    <section id="cv-updates" className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Current application CV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="break-words font-medium">{current.fileName}</p>
          <Badge variant="outline">
            {current.verified ? "Approved" : "Needs review"}
          </Badge>
          {current.id !== item.selectedCv.id && (
            <p className="text-sm text-muted-foreground">
              Current preparation still uses {item.selectedCv.fileName}. The
              updated CV has its own approved information snapshot; existing
              forms and answers keep their original data.
            </p>
          )}
        </CardContent>
      </Card>
      {updates
        .filter((u) => ["pending", "reviewing"].includes(u.status))
        .map((update) => (
          <Card key={update.resumeId} className="border-amber-300">
            <CardHeader>
              <CardTitle>Pending CV update</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="break-words font-medium">{update.fileName}</p>
              <Badge variant="outline">
                {update.status === "reviewing"
                  ? "Reviewing update"
                  : "Needs HR review"}
              </Badge>
              <p className="text-sm text-muted-foreground">
                Current approval, account access and assigned forms remain
                active. Approving this update does not rerun preparation.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={reviewId === update.resumeId}
                  onClick={() => openReview(update.resumeId)}
                >
                  {reviewId === update.resumeId
                    ? "Review open"
                    : "Review update"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (dirty) {
                      setError("Save or discard your update edits first.");
                      return;
                    }
                    setDeclineId(update.resumeId);
                    setReason("");
                    setError("");
                  }}
                >
                  Keep current CV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      {reviewId && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Review CV update</h2>
            <Button variant="outline" onClick={() => openReview(null)}>
              Close update review
            </Button>
          </div>
          <p className="break-words text-sm">
            Currently reviewing update: <strong>{reviewing?.fileName}</strong>
          </p>
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-lg border p-3">
              <p className="mb-3 break-words text-sm font-medium">
                Previous application CV: {previous.fileName}
              </p>
              <div className="h-[28rem]">
                <ResumePdfPreview
                  resumeId={previous.id}
                  fileName={previous.fileName}
                  contained
                />
              </div>
            </div>
            <div className="min-w-0 rounded-lg border p-3">
              <p className="mb-3 break-words text-sm font-medium">
                Updated CV: {reviewing?.fileName}
              </p>
              <div className="h-[28rem]">
                <ResumePdfPreview
                  resumeId={reviewId}
                  fileName={reviewing?.fileName ?? "CV.pdf"}
                  contained
                />
              </div>
            </div>
          </div>
          <ResumeDetailView
            key={reviewId}
            resumeId={reviewId}
            embedded
            hidePdfPreview
            onChanged={onChanged}
            onDirtyChange={(value) => {
              setDirty(value);
              onDirtyChange(value);
            }}
          />
        </div>
      )}
      {updates.some((u) => ["accepted", "declined"].includes(u.status)) && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            CV update decisions
          </summary>
          <ul className="mt-3 space-y-3 text-sm">
            {updates
              .filter((u) => ["accepted", "declined"].includes(u.status))
              .map((u) => (
                <li key={u.resumeId} className="break-words">
                  {u.fileName} ·{" "}
                  {u.status === "accepted"
                    ? "Approved update"
                    : "Current CV kept"}
                  {u.reason ? ` · ${u.reason}` : ""}
                </li>
              ))}
          </ul>
        </details>
      )}
      {error && !declineId && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={!!declineId}
        onOpenChange={(open) => {
          if (!open && !busy) setDeclineId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keep current CV?</DialogTitle>
            <DialogDescription>
              Decline {updates.find((u) => u.resumeId === declineId)?.fileName}.
              The current CV and application progress stay active. Record a
              short reason for the decision.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason for keeping current CV"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeclineId(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || reason.trim().length < 3}
              onClick={() => void decline()}
            >
              Keep current CV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
