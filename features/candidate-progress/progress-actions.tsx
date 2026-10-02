"use client";
import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, MoveRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { workflowApi, errorText } from "@/features/workflows/client";
import {
  STAGES,
  STAGE_LABELS,
  transitionRequirement,
  type CandidateProgress,
  type CandidateStage,
} from "./progress";
export function MoveMenu({
  item,
  disabled,
  onMove,
}: {
  item: CandidateProgress;
  disabled?: boolean;
  onMove: (item: CandidateProgress, stage: CandidateStage) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Move ${item.name} to another stage`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Move to…</DropdownMenuLabel>
        {STAGES.map((s) => (
          <DropdownMenuItem
            key={s}
            disabled={s === item.stage}
            onSelect={() => onMove(item, s)}
          >
            <MoveRight />
            {STAGE_LABELS[s]}
            {transitionRequirement(item.facts, s) && " · action needed"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function MoveDialog({
  move,
  onClose,
  onChanged,
}: {
  move: { item: CandidateProgress; stage: CandidateStage } | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const requirement = move
      ? transitionRequirement(move.item.facts, move.stage)
      : null,
    backward =
      !!move && STAGES.indexOf(move.stage) < STAGES.indexOf(move.item.stage);
  async function save() {
    if (!move) return;
    setBusy(true);
    setError("");
    try {
      await workflowApi(`/api/candidates/${move.item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "move",
          stage: move.stage,
          reason,
          expectedRevision: move.item.revision,
        }),
      });
      onChanged();
      onClose();
    } catch (e) {
      setError(errorText(e));
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!move}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {requirement
              ? "Action needed"
              : `Move to ${move ? STAGE_LABELS[move.stage] : ""}?`}
          </DialogTitle>
          <DialogDescription>
            {requirement?.message ??
              (backward
                ? "This changes the HR stage. Existing approval, account, invitations and submitted forms remain preserved. New progress events may advance the candidate again."
                : "This updates the HR stage. Account, invitation and submission facts stay accurate.")}
          </DialogDescription>
        </DialogHeader>
        {move && (
          <p className="text-sm">
            <strong>{move.item.name}</strong> · {move.item.selectedCv.fileName}
          </p>
        )}
        {backward && !requirement && (
          <Textarea
            aria-label="Reason for moving backward"
            placeholder="Why is this candidate returning to an earlier stage?"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {requirement ? (
            <Button asChild>
              <Link
                href={
                  requirement.kind === "review"
                    ? `/resumes/${move!.item.selectedCv.id}?candidateId=${move!.item.id}`
                    : requirement.kind === "prepare"
                      ? move!.item.selectedCv.intakeId
                        ? `/intake/${move!.item.selectedCv.intakeId}`
                        : move!.item.run
                          ? `/workflows/${move!.item.run.workflowId}?tab=runs&run=${move!.item.run.id}`
                          : "/workflows"
                      : `/candidates/${move!.item.id}`
                }
              >
                {requirement.kind === "review"
                  ? "Review and approve CV"
                  : requirement.kind === "prepare"
                    ? "Open preparation"
                    : "View required forms"}
              </Link>
            </Button>
          ) : (
            <Button
              disabled={busy || (backward && reason.trim().length < 3)}
              onClick={() => void save()}
            >
              {busy && <LoaderCircle className="animate-spin" />}Move candidate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
