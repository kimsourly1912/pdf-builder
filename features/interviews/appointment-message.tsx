"use client";
import { useState } from "react";
import { Copy, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { appointmentMessage } from "./communication";
import type { InterviewProcess, InterviewRound } from "./interviews";
export function AppointmentMessage({
  process,
  round,
}: {
  process: InterviewProcess;
  round: InterviewRound;
}) {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setMessage(appointmentMessage(process, round));
          setNotice("");
          setError(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquare aria-hidden="true" />
          Prepare candidate message
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Candidate appointment message</DialogTitle>
          <DialogDescription>
            Review or edit this message, then copy it into your email or
            messaging app. Copying does not send it or confirm attendance.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="candidate-appointment-message">
            Message to candidate
          </Label>
          <Textarea
            id="candidate-appointment-message"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setNotice("");
            }}
            rows={12}
            className="break-words"
          />
        </div>
        {notice && (
          <FeedbackAlert
            tone={error ? "error" : "success"}
            title={error ? "Copy unavailable" : "Message copied"}
            description={notice}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!message.trim()}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
                setError(false);
                setNotice(
                  "Copied. Send the message using your usual communication channel.",
                );
              } catch {
                setError(true);
                setNotice(
                  "Copy is unavailable. Select the message and copy it manually.",
                );
                const field = document.getElementById(
                  "candidate-appointment-message",
                );
                if (field instanceof HTMLTextAreaElement) {
                  field.focus();
                  field.select();
                }
              }
            }}
          >
            <Copy aria-hidden="true" />
            Copy message
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close message
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
