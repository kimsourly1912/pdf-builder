"use client";
import { useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { workflowApi, errorText } from "@/features/workflows/client";
import {
  RESET_OPTIONS,
  type ResetChoice,
  type ResetPreview,
  type ResetResult,
} from "./reset";

export function TestDataDashboard({
  displayName,
  enabled,
}: {
  displayName: string;
  enabled: boolean;
}) {
  const [choice, setChoice] = useState<ResetChoice | null>(null),
    [preview, setPreview] = useState<ResetPreview | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<ResetResult | null>(null),
    [keepDefinitions, setKeepDefinitions] = useState(true);
  async function loadPreview(next: ResetChoice) {
    setChoice(next);
    setPreview(null);
    setConfirmation("");
    setError("");
    setBusy(true);
    try {
      setPreview(
        (
          await workflowApi<{ preview: ResetPreview }>("/api/test-data", {
            method: "POST",
            body: JSON.stringify({ action: "preview", ...next }),
          })
        ).preview,
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!choice || !preview || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await workflowApi<{ result: ResetResult }>(
        "/api/test-data",
        {
          method: "POST",
          body: JSON.stringify({
            action: "reset",
            ...choice,
            revision: preview.revision,
            confirmation,
          }),
        },
      );
      setResult(response.result);
      setChoice(null);
      setPreview(null);
      setConfirmation("");
    } catch (e) {
      setError(errorText(e));
      setPreview(null);
      setConfirmation("");
    } finally {
      setBusy(false);
    }
  }
  const current = RESET_OPTIONS.find((o) => o.scope === choice?.scope);
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Test data reset"
        eyebrow="Staging tools"
        description="Start a fresh test without deleting archived records one by one. These actions permanently remove data from this workspace."
      />
      <Alert>
        <AlertTriangle />
        <AlertDescription>
          Your administrator account, password, integration settings and secrets
          are preserved. Regular Archive protection still applies elsewhere.
          Incoming bot messages or new uploads can create new data after a
          reset.
        </AlertDescription>
      </Alert>
      {!enabled && (
        <Alert>
          <AlertDescription>
            Reset controls are disabled for this deployment. Enable
            TEST_DATA_RESET_ENABLED only for a test workspace.
          </AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert role="status">
          <AlertDescription>
            <strong>Reset completed.</strong> {result.removed} records removed.{" "}
            {result.filesDeleted} of {result.filesQueued} stored files cleaned
            up.
            {result.filesPending !== null &&
              result.filesPending > 0 &&
              ` ${result.filesPending} files remain queued; automatic cleanup will retry.`}{" "}
            {result.filesPending === null &&
              " Cleanup is queued; progress could not be refreshed. Scheduled cleanup will retry."}{" "}
            Your admin access is unchanged. Continue testing from Home or
            Incoming candidates.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {RESET_OPTIONS.map((option) => (
          <section
            key={option.scope}
            className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5"
          >
            <div>
              <h2 className="font-semibold">{option.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {option.description}
              </p>
            </div>
            {option.scope === "all" && (
              <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={keepDefinitions}
                  onChange={(e) => setKeepDefinitions(e.target.checked)}
                  disabled={busy}
                />
                <span>
                  Keep form templates and workflow definitions
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Uncheck to remove drafts, published versions and legacy PDF
                    templates too.
                  </span>
                </span>
              </label>
            )}
            <Button
              variant="outline"
              className="mt-auto w-fit"
              disabled={!enabled || busy}
              onClick={() =>
                void loadPreview({
                  scope: option.scope,
                  keepDefinitions:
                    option.scope === "all" ? keepDefinitions : true,
                })
              }
            >
              <Trash2 />
              Preview what will be removed
            </Button>
          </section>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Archived records are included. Reset receipts are retained in Activity.
        Existing messages already sent to Telegram cannot be recalled; old
        account and form links stop working when their records are removed.
      </p>
      <Dialog
        open={!!choice}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setChoice(null);
            setPreview(null);
            setError("");
            setConfirmation("");
          }
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>{current?.title}</DialogTitle>
            <DialogDescription>
              {current?.description} This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {choice?.scope === "all" && (
            <p className="text-sm font-medium">
              {choice.keepDefinitions
                ? "Form templates and workflows will be kept."
                : "Form templates and workflows will also be permanently deleted."}
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {busy && !preview && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin" />
              Loading reset preview…
            </p>
          )}
          {preview && (
            <>
              <div className="rounded-lg border p-3">
                <h3 className="text-sm font-semibold">Affected records</h3>
                {preview.counts.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {preview.counts.map((row) => (
                      <li
                        key={row.table}
                        className="flex justify-between gap-4"
                      >
                        <span>{row.label}</span>
                        <span className="font-medium tabular-nums">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No matching test data to clear.
                  </p>
                )}
                <p className="mt-3 border-t pt-3 text-sm">
                  {preview.files} stored files eligible for cleanup.
                </p>
              </div>
              {preview.blockers.map((b) => (
                <Alert key={b}>
                  <AlertDescription>{b}</AlertDescription>
                </Alert>
              ))}
              {preview.counts.length > 0 && !preview.blockers.length && (
                <div className="space-y-2">
                  <Label htmlFor="reset-confirmation">
                    Type DELETE TEST DATA to confirm
                  </Label>
                  <Input
                    id="reset-confirmation"
                    autoComplete="off"
                    value={confirmation}
                    disabled={busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your administrator account stays available. Stored-file
                    cleanup may continue after this operation.
                  </p>
                </div>
              )}
            </>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setChoice(null);
                setPreview(null);
                setError("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={busy || !choice}
              onClick={() => choice && void loadPreview(choice)}
            >
              <RotateCcw />
              Refresh preview
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy ||
                !preview ||
                !preview.counts.length ||
                !!preview.blockers.length ||
                confirmation !== "DELETE TEST DATA"
              }
              onClick={() => void reset()}
            >
              {busy && preview ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              Delete test data permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
