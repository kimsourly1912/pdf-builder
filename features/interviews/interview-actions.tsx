"use client";
import { useRef, useState } from "react";
import {
  PauseCircle,
  PlayCircle,
  UserMinus,
  RotateCcw,
  Pencil,
  SlidersHorizontal,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { InterviewProcess } from "./interviews";
const actions = {
  hold: {
    title: "Pause interviews",
    hint: "Temporary pause",
    text: "Keep the process open and continue later. A reason and optional follow-up date help explain the pause.",
    icon: PauseCircle,
  },
  resume: {
    title: "Resume interviews",
    hint: "Continue",
    text: "Return to the step saved before the pause. Your existing rounds and feedback stay in place.",
    icon: PlayCircle,
  },
  withdraw: {
    title: "Record candidate withdrawal",
    hint: "Closes process",
    text: "Use when the candidate no longer wants to continue. This records Withdrawn, not Not selected.",
    icon: UserMinus,
  },
  reopen: {
    title: "Reopen interviews",
    hint: "Continue review",
    text: "Continue a closed process. The earlier decision stays in History.",
    icon: RotateCcw,
  },
  correct_decision: {
    title: "Correct final decision",
    hint: "Fix an outcome",
    text: "Correct a recorded Interview passed / Not selected outcome. The process stays closed and the earlier outcome is kept.",
    icon: Pencil,
  },
};
export function InterviewStatusActions({
  process,
  disabled,
  onChoose,
}: {
  process: InterviewProcess;
  disabled: boolean;
  onChoose: (action: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false),
    choosing = useRef(false);
  const options: (keyof typeof actions)[] = process.outcome
    ? [
        "reopen",
        ...(process.stage === "decision" && process.outcome !== "withdrawn"
          ? ["correct_decision" as const]
          : []),
      ]
    : [process.hold ? "resume" : "hold", "withdraw"];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button id="process-actions" variant="outline" disabled={disabled}>
          <SlidersHorizontal aria-hidden="true" />
          Manage status
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (choosing.current) {
            event.preventDefault();
            choosing.current = false;
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Manage interview status</DialogTitle>
          <DialogDescription>
            Choose what happened. You will enter a reason before anything
            changes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {options.map((action) => {
            const item = actions[action],
              Icon = item.icon;
            return (
              <Button
                key={action}
                variant="outline"
                className="h-auto w-full items-start justify-start whitespace-normal p-4 text-left"
                onClick={() => {
                  choosing.current = true;
                  setOpen(false);
                  onChoose(action, item.title);
                }}
              >
                <Icon
                  className="mt-1 size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{item.title}</span>
                    <Badge variant="secondary">{item.hint}</Badge>
                  </span>
                  <span className="block text-sm font-normal leading-relaxed text-muted-foreground">
                    {item.text}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 size-4 shrink-0"
                  aria-hidden="true"
                />
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
