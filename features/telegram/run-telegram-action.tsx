"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { WorkflowRun } from "@/features/workflows/workflow";
export function RunTelegramAction({
  run,
  onUpdated,
  refreshKey = "",
}: {
  run: WorkflowRun;
  onUpdated: (run: WorkflowRun) => void;
  refreshKey?: string;
}) {
  const [connections, setConnections] = useState<
      {
        id: string;
        fullName: string;
        username: string;
        email: string;
        confirmedCandidateId: string | null;
        confirmedBy: string | null;
        revision: string;
      }[]
    >([]),
    [connectionId, setConnectionId] = useState(
      run.context.telegramConnectionId ?? "",
    ),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [resendOpen, setResendOpen] = useState(false),
    [bot, setBot] = useState<{
      configured: boolean;
      username: string | null;
    } | null>(null);
  const [delivery, setDelivery] = useState<{
    status: string;
    errorMessage: string | null;
    nextAttemptAt: string | null;
  } | null>(null);
  const [checkedRevision, setCheckedRevision] = useState<string | null>(null);
  const checkKey = `${run.updatedAt}:${refreshKey}`;
  const loading = checkedRevision !== checkKey;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      workflowApi<{ items: typeof connections; bot: NonNullable<typeof bot> }>(
        "/api/intake/connections",
        { signal: controller.signal },
      ),
      workflowApi<{ delivery: typeof delivery }>(
        `/api/workflow-runs/${run.id}/telegram`,
        { signal: controller.signal },
      ),
    ])
      .then(([r, d]) => {
        if (!controller.signal.aborted) {
          setConnections(r.items);
          setConnectionId(
            (previous) =>
              previous ||
              run.context.telegramConnectionId ||
              r.items.find(
                (c) =>
                  c.confirmedCandidateId === run.context.candidateId &&
                  !!c.confirmedBy,
              )?.id ||
              "",
          );
          setBot(r.bot);
          setDelivery(d.delivery);
          setError("");
          setCheckedRevision(checkKey);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(errorText(e));
          setCheckedRevision(checkKey);
        }
      });
    return () => controller.abort();
  }, [
    run.id,
    checkKey,
    run.context.telegramConnectionId,
    run.context.candidateId,
  ]);
  async function act(action: "connect" | "resend") {
    setBusy(true);
    setError("");
    try {
      const r = await workflowApi<{ run: WorkflowRun }>(
        `/api/workflow-runs/${run.id}/telegram`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            confirm: true,
            connectionId,
            contactRevision: connections.find((c) => c.id === connectionId)
              ?.revision,
            expectedUpdatedAt: run.updatedAt,
          }),
        },
      );
      onUpdated(r.run);
      setResendOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const storedConfirmation = connections.some(
    (c) =>
      c.id === connectionId &&
      c.confirmedCandidateId === run.context.candidateId &&
      !!c.confirmedBy,
  );
  const resending =
    delivery?.status === "sent" || delivery?.status === "uncertain";
  const actionable =
    run.status === "completed" ||
    run.currentNodeId ===
      run.graph.nodes.find((n) => n.kind === "send_telegram")?.id;
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <h3 className="font-medium">Telegram invitation</h3>
      <p role="status" className="text-sm text-muted-foreground">
        {loading
          ? "Checking invitation…"
          : delivery?.status === "sent"
            ? "Invitation sent. Telegram accepted the message; reading is not confirmed."
            : delivery?.status === "uncertain"
              ? "Delivery uncertain. Check with the candidate before resending."
              : delivery?.status === "sending"
                ? "Invitation is being sent. Please wait."
                : delivery?.status === "failed"
                  ? "Invitation failed. You can retry after checking the contact."
                  : "No sent invitation recorded."}
      </p>
      {bot && !bot.configured && (
        <p className="text-sm text-muted-foreground">
          Bot configuration is incomplete. The invitation waits until
          configuration is ready.{" "}
          <Link className="underline" href="/administration">
            Check integrations
          </Link>
        </p>
      )}
      <details open={delivery?.status !== "sent"} className="space-y-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Invitation options
        </summary>
        <div className="mt-3 space-y-3">
          <Select
            value={connectionId}
            onValueChange={(v) => {
              setConnectionId(v);
              setConfirmed(false);
            }}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Run Telegram connection"
            >
              <SelectValue placeholder="Choose candidate contact" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fullName || "New contact"} ·{" "}
                  {c.username ? `@${c.username}` : c.email || "Telegram user"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {storedConfirmation ? (
            <p className="text-sm">
              ✓ Telegram contact confirmed for this candidate.
            </p>
          ) : (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
              />
              <span>
                I confirmed this Telegram contact belongs to this candidate.
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={
              busy ||
              loading ||
              !actionable ||
              delivery?.status === "sending" ||
              !connectionId ||
              !(confirmed || storedConfirmation) ||
              !bot?.configured
            }
            onClick={() =>
              resending ? setResendOpen(true) : void act("connect")
            }
          >
            {resending
              ? "Resend invitation"
              : delivery?.status === "failed"
                ? "Retry invitation"
                : "Send invitation"}
          </Button>
          {bot?.username && (
            <p className="break-all text-xs text-muted-foreground">
              Share the connection link:{" "}
              <a
                className="underline"
                href={`https://t.me/${bot.username}`}
                target="_blank"
                rel="noreferrer"
              >
                t.me/{bot.username}
              </a>
            </p>
          )}
        </div>
      </details>
      <Dialog open={resendOpen} onOpenChange={setResendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resend the Telegram invitation?</DialogTitle>
            <DialogDescription>
              The candidate may already have received the previous message.
              Confirm with them before resending. An expired unused activation
              link will be replaced.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResendOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void act("resend")}>
              Confirm resend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
