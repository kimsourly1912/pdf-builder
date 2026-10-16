"use client";
import { useEffect, useState, useRef } from "react";
import { FileText, UserRound, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/patterns/status-badge";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { ResumePdfPreview } from "@/features/resumes/resume-pdf-preview";
import { AnswerSummary, type Review } from "@/features/hr/submission-review";
import { interviewApi } from "./client";
import { PreparationContextPanel } from "./preparation-context-panel";
import type { InterviewProcess } from "./interviews";

type Preview = {
  kind: "cv" | "account" | "form";
  title: string;
  responseUrl?: string | null;
  pdfUrl?: string | null;
};
type Account = {
  name: string;
  email: string;
  accountType: string;
  mustChangePassword: boolean;
  blocked: boolean;
};
export function InterviewDocuments({ process }: { process: InterviewProcess }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  function openPreview(value: Preview) {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPreview(value);
  }
  function closePreview() {
    setPreview(null);
    setTimeout(() => trigger.current?.focus(), 0);
  }
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      <div className="space-y-2">
        <h2 className="font-semibold">{process.snapshot.contextKind === "approved_cv" ? "Original interview CV & documents" : "Accepted preparation & documents"}</h2>
        <p className="text-sm text-muted-foreground">
          {process.snapshot.contextKind === "approved_cv" ? "Captured on " : "Accepted on "}
          {new Date(process.snapshot.acceptedAt).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          . These are the original documents used to start interviews.
        </p>
      </div>
      <PreparationContextPanel process={process} />
      <div className="grid gap-3 sm:grid-cols-2">
        <DocumentRow
          title={process.snapshot.cv.fileName}
          label={process.snapshot.contextKind === "approved_cv" ? "HR-approved CV" : "Accepted CV"}
          icon={<FileText className="size-5" aria-hidden="true" />}
          onOpen={() =>
            openPreview({ kind: "cv", title: process.snapshot.cv.fileName })
          }
        />
        {process.snapshot.accountId && (
          <DocumentRow
            title="Linked account"
            label="View account details"
            icon={<UserRound className="size-5" aria-hidden="true" />}
            onOpen={() =>
              openPreview({ kind: "account", title: "Linked account" })
            }
          />
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          Accepted forms{" "}
          <span className="text-muted-foreground">
            ({process.snapshot.forms.length})
          </span>
        </h3>
        {process.snapshot.forms.length ? (
          process.snapshot.forms.map((form) => (
            <DocumentRow
              key={form.id}
              title={form.name}
              label={`Version ${form.versionNumber}`}
              icon={<FileText className="size-5" aria-hidden="true" />}
              accepted
              disabled={!form.responseUrl && !form.url}
              onOpen={() =>
                openPreview({
                  kind: "form",
                  title: form.name,
                  responseUrl: form.responseUrl,
                  pdfUrl: form.url,
                })
              }
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            {process.snapshot.contextKind === "approved_cv" ? "This hiring model allows interviews before document collection. No accepted forms were linked at the start." : "No accepted forms were required for this preparation."}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Previews open here. Closing them returns you to this interview. Later
        preparation changes do not replace these documents.
      </p>
      {preview && (
        <DocumentPreview
          key={`${preview.kind}:${preview.title}:${preview.responseUrl}`}
          process={process}
          preview={preview}
          onClose={closePreview}
        />
      )}
    </section>
  );
}
function DocumentRow({
  title,
  label,
  icon,
  accepted,
  disabled,
  onOpen,
}: {
  title: string;
  label: string;
  icon: React.ReactNode;
  accepted?: boolean;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border p-3 sm:flex">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="break-words text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {disabled && (
          <p className="text-xs text-muted-foreground">Preview unavailable</p>
        )}
      </div>
      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
        {accepted && <StatusBadge label="Accepted" tone="success" />}
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onOpen}
          aria-label={`Preview ${title}`}
        >
          <Eye aria-hidden="true" />
          Preview
        </Button>
      </div>
    </div>
  );
}
function DocumentPreview({
  process,
  preview,
  onClose,
}: {
  process: InterviewProcess;
  preview: Preview;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
      review?: Review;
      account?: Account;
    } | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (
      preview.kind === "cv" ||
      (preview.kind === "form" && !preview.responseUrl)
    )
      return;
    let active = true;
    const url =
      preview.kind === "account"
        ? `/api/interviews/${process.id}/account`
        : `/api${preview.responseUrl}`;
    interviewApi<{ review?: Review; account?: Account }>(url)
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Preview could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [process.id, preview, attempt]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90svh] min-w-0 flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle className="break-words">{preview.title}</DialogTitle>
          <DialogDescription>
            {preview.kind === "account"
              ? "Current details of the account linked to this interview."
              : "Read-only preview of the original accepted document."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          {preview.kind === "cv" ? (
            <div className="h-[65svh]">
              <ResumePdfPreview
                resumeId={process.snapshot.cv.id}
                fileName={process.snapshot.cv.fileName}
                contained
              />
            </div>
          ) : (
            <>
              {error && (
                <FeedbackAlert
                  tone="error"
                  title="Preview unavailable"
                  description={
                    <div className="space-y-2">
                      <p>{error}</p>
                      <Button
                        variant="outline"
                        onClick={() => setAttempt((v) => v + 1)}
                      >
                        Try again
                      </Button>
                    </div>
                  }
                />
              )}
              {!error &&
                !data &&
                (preview.kind === "account" || preview.responseUrl) && (
                  <p
                    role="status"
                    className="p-4 text-sm text-muted-foreground"
                  >
                    Loading preview…
                  </p>
                )}
              {data?.account && (
                <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  {[
                    ["Name", data.account.name],
                    ["Email", data.account.email],
                    ["Account category", data.account.accountType],
                    ["Access", data.account.blocked ? "Blocked" : "Active"],
                    [
                      "Password",
                      data.account.mustChangePassword
                        ? "Password change required"
                        : "Password setup complete",
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="space-y-1">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="break-words text-sm font-medium">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {preview.kind === "form" && (
                <Tabs
                  defaultValue={preview.responseUrl ? "answers" : "pdf"}
                  className="space-y-4"
                >
                  <TabsList>
                    {preview.responseUrl && (
                      <TabsTrigger value="answers">
                        Submitted answers
                      </TabsTrigger>
                    )}
                    {preview.pdfUrl && (
                      <TabsTrigger value="pdf">PDF preview</TabsTrigger>
                    )}
                  </TabsList>
                  {data?.review && (
                    <TabsContent value="answers" className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge label="Accepted document" tone="success" />
                        <p className="text-sm text-muted-foreground">
                          Submitted by {data.review.name} · {data.review.email}
                        </p>
                      </div>
                      <AnswerSummary answers={data.review.answers} />
                    </TabsContent>
                  )}
                  {preview.pdfUrl && (
                    <TabsContent value="pdf">
                      <div className="h-[60svh]">
                        <ResumePdfPreview
                          resumeId="accepted-form"
                          url={preview.pdfUrl}
                          fileName={`${preview.title}.pdf`}
                          contained
                        />
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t pt-3">
          <Button variant="outline" onClick={onClose}>
            Close preview
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
