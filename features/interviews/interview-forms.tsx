"use client";
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import {
  CRITERIA,
  RECOMMENDATIONS,
  type Appointment,
  type InterviewRound,
  type Scorecard,
} from "./interviews";
export function InterviewField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
const EMPTY_APPOINTMENT: Appointment = {
  startsAt: "",
  localDateTime: "",
  timezone: "Asia/Phnom_Penh",
  duration: 60,
  kind: "in_person",
  location: "",
  notes: "",
};
export type InterviewOperation = {
  action: string;
  title: string;
  round?: InterviewRound;
  interviewer?: string;
};
export function InterviewOperationDialog({
  operation,
  busy,
  error,
  onClose,
  onSave,
}: {
  operation: InterviewOperation;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const { action, round } = operation,
    scheduling = ["schedule", "reschedule"].includes(action),
    feedback = action === "feedback";
  const [appointment, setAppointment] = useState<Appointment>(
      round?.appointment ?? EMPTY_APPOINTMENT,
    ),
    [name, setName] = useState(""),
    [interviewers, setInterviewers] = useState(""),
    [reason, setReason] = useState(""),
    [outcome, setOutcome] = useState("passed"),
    [followUp, setFollowUp] = useState("");
  const draft = round?.feedback.find(
    (f) => f.interviewer === operation.interviewer,
  )?.scorecard;
  const [scorecard, setScorecard] = useState<Scorecard>(
    draft ?? {
      ratings: [null, null, null, null],
      notes: "",
      strengths: "",
      concerns: "",
      recommendation: "proceed",
    },
  );
  const [feedbackStatus, setFeedbackStatus] = useState("draft");
  const needsReason = [
    "reschedule",
    "cancel",
    "no_show",
    "decide",
    "correct_decision",
    "withdraw",
    "reopen",
    "hold",
    "resume",
  ].includes(action);
  function values() {
    return {
      action,
      ...(round ? { roundId: round.id } : {}),
      ...(scheduling
        ? {
            appointment,
            ...(action === "schedule"
              ? {
                  name,
                  interviewers: interviewers
                    .split("\n")
                    .map((n) => n.trim())
                    .filter(Boolean),
                }
              : {}),
          }
        : {}),
      ...(feedback
        ? {
            interviewer: operation.interviewer,
            status: feedbackStatus,
            scorecard,
          }
        : {}),
      ...(needsReason ? { reason } : {}),
      ...(["decide", "correct_decision"].includes(action) ? { outcome } : {}),
      ...(action === "hold" ? { followUp } : {}),
    };
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(values());
          }}
        >
          <DialogHeader>
            <DialogTitle>{operation.title}</DialogTitle>
            <DialogDescription>
              {feedback
                ? `Evaluation attributed to ${operation.interviewer}. The management owner is recorded separately as the person entering it.`
                : scheduling
                  ? "Record an internal appointment. Scheduling does not send a message or confirm attendance."
                  : "This records an explicit action and preserves earlier appointments and decisions in history."}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            {scheduling && (
              <>
                {action === "schedule" && (
                  <>
                    <InterviewField id="round-name" label="Interview name">
                      <Input
                        id="round-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={160}
                        placeholder="HR interview / Manager interview"
                        autoFocus
                      />
                    </InterviewField>
                    <InterviewField
                      id="round-interviewers"
                      label="Required interviewers (one name per line)"
                    >
                      <Textarea
                        id="round-interviewers"
                        value={interviewers}
                        onChange={(e) => setInterviewers(e.target.value)}
                        required
                        maxLength={1210}
                        placeholder={"Sokha\nDara"}
                      />
                    </InterviewField>
                  </>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <InterviewField
                    id="appointment-time"
                    label="Local date and time"
                  >
                    <Input
                      id="appointment-time"
                      type="datetime-local"
                      value={appointment.localDateTime}
                      onChange={(e) =>
                        setAppointment({
                          ...appointment,
                          localDateTime: e.target.value,
                        })
                      }
                      required
                    />
                  </InterviewField>
                  <InterviewField
                    id="appointment-timezone"
                    label="Explicit timezone (IANA)"
                  >
                    <Input
                      id="appointment-timezone"
                      list="interview-timezones"
                      value={appointment.timezone}
                      onChange={(e) =>
                        setAppointment({
                          ...appointment,
                          timezone: e.target.value,
                        })
                      }
                      required
                      maxLength={80}
                    />
                    <datalist id="interview-timezones">
                      <option value="Asia/Phnom_Penh" />
                      <option value="Asia/Bangkok" />
                      <option value="UTC" />
                      <option value="Europe/London" />
                      <option value="America/New_York" />
                    </datalist>
                  </InterviewField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InterviewField
                    id="appointment-duration"
                    label="Duration (minutes)"
                  >
                    <Input
                      id="appointment-duration"
                      type="number"
                      min={5}
                      max={480}
                      value={appointment.duration}
                      onChange={(e) =>
                        setAppointment({
                          ...appointment,
                          duration: Number(e.target.value),
                        })
                      }
                      required
                    />
                  </InterviewField>
                  <InterviewField
                    id="appointment-kind"
                    label="Interview format"
                  >
                    <SelectField
                      id="appointment-kind"
                      className="w-full"
                      value={appointment.kind}
                      onValueChange={(kind) =>
                        setAppointment({
                          ...appointment,
                          kind: kind as Appointment["kind"],
                        })
                      }
                    >
                      <SelectFieldOption value="in_person">
                        In-person
                      </SelectFieldOption>
                      <SelectFieldOption value="online">
                        Online (HTTPS meeting link)
                      </SelectFieldOption>
                    </SelectField>
                  </InterviewField>
                </div>
                <InterviewField
                  id="appointment-location"
                  label={
                    appointment.kind === "online"
                      ? "HTTPS meeting link"
                      : "In-person location"
                  }
                >
                  <Input
                    id="appointment-location"
                    type={appointment.kind === "online" ? "url" : "text"}
                    value={appointment.location}
                    onChange={(e) =>
                      setAppointment({
                        ...appointment,
                        location: e.target.value,
                      })
                    }
                    required
                    maxLength={1000}
                  />
                </InterviewField>
                <InterviewField
                  id="appointment-notes"
                  label="Internal preparation notes"
                >
                  <Textarea
                    id="appointment-notes"
                    value={appointment.notes}
                    onChange={(e) =>
                      setAppointment({ ...appointment, notes: e.target.value })
                    }
                    maxLength={2000}
                  />
                </InterviewField>
              </>
            )}
            {feedback && (
              <>
                <p className="text-sm text-muted-foreground">
                  Use 1 (limited evidence) to 5 (strong evidence). Not assessed
                  remains unscored.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {CRITERIA.map((criterion, i) => (
                    <InterviewField
                      key={criterion}
                      id={`rating-${i}`}
                      label={criterion}
                    >
                      <SelectField
                        id={`rating-${i}`}
                        className="w-full"
                        value={scorecard.ratings[i] ?? "none"}
                        onValueChange={(value) =>
                          setScorecard({
                            ...scorecard,
                            ratings: scorecard.ratings.map((r, j) =>
                              i === j
                                ? value === "none"
                                  ? null
                                  : Number(value)
                                : r,
                            ),
                          })
                        }
                      >
                        <SelectFieldOption value="none">
                          Not assessed
                        </SelectFieldOption>
                        {[1, 2, 3, 4, 5].map((r) => (
                          <SelectFieldOption key={r} value={r}>
                            {r}
                          </SelectFieldOption>
                        ))}
                      </SelectField>
                    </InterviewField>
                  ))}
                </div>
                {(["notes", "strengths", "concerns"] as const).map((field) => (
                  <InterviewField
                    key={field}
                    id={`feedback-${field}`}
                    label={
                      field === "notes"
                        ? "Job-related notes"
                        : field === "strengths"
                          ? "Strengths"
                          : "Concerns"
                    }
                  >
                    <Textarea
                      id={`feedback-${field}`}
                      value={scorecard[field]}
                      onChange={(e) =>
                        setScorecard({ ...scorecard, [field]: e.target.value })
                      }
                      maxLength={2000}
                    />
                  </InterviewField>
                ))}
                <InterviewField
                  id="recommendation"
                  label="Overall recommendation"
                >
                  <SelectField
                    id="recommendation"
                    className="w-full"
                    value={scorecard.recommendation}
                    onValueChange={(recommendation) =>
                      setScorecard({
                        ...scorecard,
                        recommendation:
                          recommendation as Scorecard["recommendation"],
                      })
                    }
                  >
                    {Object.entries(RECOMMENDATIONS).map(([key, label]) => (
                      <SelectFieldOption key={key} value={key}>
                        {label}
                      </SelectFieldOption>
                    ))}
                  </SelectField>
                </InterviewField>
                <InterviewField id="feedback-status" label="Evaluation status">
                  <SelectField
                    id="feedback-status"
                    className="w-full"
                    value={feedbackStatus}
                    onValueChange={setFeedbackStatus}
                  >
                    <SelectFieldOption value="draft">
                      Draft — still outstanding
                    </SelectFieldOption>
                    <SelectFieldOption value="submitted">
                      Submitted — retained for review
                    </SelectFieldOption>
                  </SelectField>
                </InterviewField>
                <p className="text-sm text-muted-foreground">
                  Submitted feedback is retained as evidence. Recommendations
                  never make the final decision.
                </p>
              </>
            )}
            {["decide", "correct_decision"].includes(action) && (
              <>
                <InterviewField id="final-outcome" label="Final outcome">
                  <SelectField
                    id="final-outcome"
                    className="w-full"
                    value={outcome}
                    onValueChange={setOutcome}
                  >
                    <SelectFieldOption value="passed">
                      Interview passed
                    </SelectFieldOption>
                    <SelectFieldOption value="not_selected">
                      Not selected
                    </SelectFieldOption>
                  </SelectField>
                </InterviewField>
                <p className="text-sm text-muted-foreground">
                  Interview passed does not mean Hired. Offers and onboarding
                  are outside interview management.
                </p>
              </>
            )}
            {needsReason && (
              <InterviewField id="action-reason" label="Reason">
                <Textarea
                  id="action-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={10}
                  maxLength={2000}
                  placeholder="Record a meaningful reason (at least 10 characters)"
                />
              </InterviewField>
            )}
            {action === "hold" && (
              <InterviewField
                id="hold-follow-up"
                label="Optional follow-up date"
              >
                <Input
                  id="hold-follow-up"
                  type="date"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
              </InterviewField>
            )}
            {action === "finish_rounds" && (
              <p className="text-sm">
                Confirm that you have reviewed the completed rounds and every
                required submitted evaluation. You can schedule another round
                later if needed.
              </p>
            )}
            {action === "complete" && (
              <p className="text-sm">
                Mark {round?.name} completed only after the interview actually
                took place. Each named interviewer will need a submitted
                evaluation.
              </p>
            )}
          </fieldset>
          {error && (
            <FeedbackAlert
              tone="error"
              title="Action could not be saved"
              description={error}
            />
          )}
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy
                ? "Saving…"
                : feedback
                  ? feedbackStatus === "submitted"
                    ? "Submit feedback"
                    : "Save draft"
                  : operation.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
