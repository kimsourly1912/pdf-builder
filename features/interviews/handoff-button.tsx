"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import type { CandidateProgress } from "@/features/candidate-progress/progress";
import { errorText } from "@/features/workflows/client";
import { interviewApi } from "./client";
import type { InterviewProcess } from "./interviews";
export function HandoffButton({
  item,
  onChanged,
}: {
  item: CandidateProgress;
  onChanged?: () => void;
}) {
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [position, setPosition] = useState(""),
    [responsible, setResponsible] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = useRef(false);
  if (item.interview)
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/interviews/${item.interview.id}`}>
          View interview progress
        </Link>
      </Button>
    );
  if (item.automaticStage !== "accepted") return null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await interviewApi<{ process: InterviewProcess }>(
        `/api/candidates/${item.id}/interviews`,
        {
          method: "POST",
          body: JSON.stringify({
            position,
            ...(responsible.trim() ? { responsible } : {}),
            expectedRevision: item.revision,
            mutationId: crypto.randomUUID(),
          }),
        },
      );
      onChanged?.();
      setOpen(false);
      router.push(`/interviews/${data.process.id}`);
    } catch (e) {
      setError(errorText(e));
      onChanged?.();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Move to interviews</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={save} className="space-y-6">
          <DialogHeader>
            <DialogTitle>Move to interviews</DialogTitle>
            <DialogDescription className="break-words">
              Start interview management for {item.name} using{" "}
              {item.selectedCv.fileName} and the accepted documents. Document
              acceptance is preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`position-${item.id}`}>Position / title</Label>
              <Input
                id={`position-${item.id}`}
                required
                minLength={2}
                maxLength={160}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`responsible-${item.id}`}>
                Responsible person (optional)
              </Label>
              <Input
                id={`responsible-${item.id}`}
                maxLength={160}
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
                placeholder="Defaults to the management owner"
              />
            </div>
          </div>
          {error && (
            <FeedbackAlert
              tone="error"
              title="Handoff could not be saved"
              description={error}
            />
          )}
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy ? "Moving…" : "Move to interviews"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
