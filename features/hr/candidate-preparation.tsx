"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formApi } from "@/features/forms/client";
import type { CandidateProgress } from "@/features/candidate-progress/progress";
type Intake = {
  candidate: { fullName: string; email: string };
  contact: { fullName: string; email: string; username: string };
  contactRevision: string;
  resumeRevision: string;
  candidateRevision: string;
  profileVersionId: string | null;
  existingAccount: { id: string; email: string } | null;
  confirmed: boolean;
};
type Workflow = {
  id: string;
  name: string;
  version: number;
  active: boolean;
  hasTelegram: boolean;
  hasPreparation?: boolean;
  trigger: string;
};
export function CandidatePreparation({
  item,
  onChanged,
}: {
  item: CandidateProgress;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false),
    [workflows, setWorkflows] = useState<Workflow[]>([]),
    [intake, setIntake] = useState<Intake | null>(null),
    [selected, setSelected] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reuse, setReuse] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void Promise.all([
      formApi<{ items: Workflow[] }>("/api/workflows"),
      item.selectedCv.intakeId
        ? formApi<Intake>(`/api/intake/${item.selectedCv.intakeId}`)
        : Promise.resolve(null),
    ])
      .then(([w, i]) => {
        if (alive) {
          setWorkflows(
            w.items.filter(
              (w) =>
                w.active &&
                w.version > 0 &&
                w.hasPreparation &&
                (!i || w.hasTelegram),
            ),
          );
          setIntake(i);
          setConfirmed(i?.confirmed ?? false);
          const eligible = w.items.filter(w=>w.active && w.version>0 && w.hasPreparation && (!i || w.hasTelegram));
          if (eligible.length === 1) setSelected(eligible[0].id);
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load preparation options.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, item.selectedCv.intakeId]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      if (intake) {
        await formApi(`/api/intake/${item.selectedCv.intakeId}/run`, {
          method: "POST",
          body: JSON.stringify({
            workflowId: selected,
            resumeRevision: intake.resumeRevision,
            candidateRevision: intake.candidateRevision,
            profileVersionId: intake.profileVersionId,
            confirmTelegram: confirmed,
            existingAccountId: reuse ? intake.existingAccount?.id : undefined,
          }),
        });
      } else {
        await formApi("/api/workflow-runs", {
          method: "POST",
          body: JSON.stringify({
            workflowId: selected,
            resumeId: item.selectedCv.id,
          }),
        });
      }
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preparation could not start.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        disabled={!item.selectedCv.verified}
        onClick={() => {
          setLoading(true);
          setError("");
          setConfirmed(false);
          setReuse(false);
          setSelected("");
          setOpen(true);
        }}
      >
        Prepare account & forms
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prepare {item.name}</DialogTitle>
            <DialogDescription>
              Use the approved CV: {item.selectedCv.fileName}. The published
              workflow controls account access, form assignment and any Telegram
              invitation. Existing history is retained.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <p role="status">Loading preparation options…</p>
          ) : (
            <>
              <Label>Published workflow</Label>
              <Select
                value={selected}
                onValueChange={(v) => setSelected(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} · v{w.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!workflows.length && (
                <p className="text-sm">
                  No suitable workflow is published.{" "}
                  <Link className="text-primary underline" href="/workflows">
                    Configure automation
                  </Link>
                </p>
              )}
              {intake && (
                <>
                  {intake.confirmed ? <p className="text-sm">✓ Telegram confirmed · @{intake.contact.username || "connected user"}</p> : <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={confirmed}
                      onCheckedChange={(v) => setConfirmed(v === true)}
                    />
                    <span>
                      I confirmed @
                      {intake.contact.username || "connected Telegram user"}{" "}
                      belongs to {item.name} ({item.email}).
                    </span>
                  </label>}
                  {intake.existingAccount && (
                    <label className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={reuse}
                        onCheckedChange={(v) => setReuse(v === true)}
                      />
                      <span>
                        Reuse the existing account{" "}
                        {intake.existingAccount.email} for this candidate.
                      </span>
                    </label>
                  )}
                </>
              )}
            </>
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
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                busy ||
                loading ||
                !selected ||
                (!!intake &&
                  (!confirmed || (!!intake.existingAccount && !reuse)))
              }
              onClick={() => void start()}
            >
              {busy ? "Starting…" : "Start preparation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ConfirmCandidateContact({
  item,
  onChanged,
}: {
  item: CandidateProgress;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const data = await formApi<Intake>(
        `/api/intake/${item.selectedCv.intakeId}`,
      );
      if (
        data.contact.username !== item.telegram ||
        data.candidate.fullName !== item.name ||
        data.candidate.email !== item.email
      )
        throw new Error(
          "Candidate contact changed. Refresh the profile and confirm the current details.",
        );
      await formApi(`/api/intake/${item.selectedCv.intakeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "confirm_contact",
          confirm: true,
          contactRevision: data.contactRevision,
          resumeRevision: data.resumeRevision,
          candidateRevision: data.candidateRevision,
        }),
      });
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Contact could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setConfirmed(false);
          setError("");
          setOpen(true);
        }}
      >
        Confirm contact
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Telegram contact</DialogTitle>
            <DialogDescription>
              Check @{item.telegram || "connected user"} belongs to {item.name}{" "}
              ({item.email}). This saves confirmation; no invitation is sent.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            I verified this contact belongs to this candidate.
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !confirmed}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : "Confirm contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
