"use client";
import { useEffect, useState } from "react";
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
}: {
  run: WorkflowRun;
  onUpdated: (run: WorkflowRun) => void;
}) {
  const [connections, setConnections] = useState<
      { id: string; fullName: string; username: string; email: string }[]
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
  useEffect(() => {
    const controller = new AbortController();
    void workflowApi<{
      items: typeof connections;
      bot: NonNullable<typeof bot>;
    }>("/api/intake/connections", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) {
          setConnections(r.items);
          setBot(r.bot);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, []);
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
  const resending = run.status === "failed" || run.status === "completed";
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <h3 className="font-medium">Telegram invitation</h3>
      {bot && !bot.configured && (
        <p className="text-sm text-muted-foreground">
          Bot configuration is incomplete. The invitation waits until
          configuration is ready.
        </p>
      )}
      <Select
        value={connectionId}
        onValueChange={(v) => {
          setConnectionId(v);
          setConfirmed(false);
        }}
      >
        <SelectTrigger className="w-full" aria-label="Run Telegram connection">
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
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
        />
        <span>
          I confirmed this Telegram contact belongs to this candidate.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        disabled={busy || !connectionId || !confirmed || !bot?.configured}
        onClick={() => (resending ? setResendOpen(true) : void act("connect"))}
      >
        {resending ? "Resend invitation" : "Confirm contact & continue"}
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
