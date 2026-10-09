"use client";
import { useState, type ReactNode } from "react";
import { hour12, hour24 } from "./appointment-presentation";
import { INTERVIEW_OPERATION_COPY } from "./final-review";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatePicker } from "@/components/ui/date-picker";
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
const COMMON_TIMEZONES = [
  "Asia/Phnom_Penh",
  "Asia/Bangkok",
  "UTC",
  "Europe/London",
  "America/New_York",
];
const TIMEZONE_LABELS: Record<string, string> = {
  "Asia/Phnom_Penh": "Cambodia · Asia/Phnom_Penh",
  "Asia/Bangkok": "Thailand · Asia/Bangkok",
  UTC: "UTC · Coordinated Universal Time",
};
const TIMEZONES = [
  ...new Set([...COMMON_TIMEZONES, ...Intl.supportedValuesOf("timeZone")]),
];
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
    [outcome, setOutcome] = useState(""),
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
  const [date, time = ""] = appointment.localDateTime.split("T");
  const [hour = "", minute = ""] = time.split(":");
  const [period, setPeriod] = useState<"AM" | "PM">(() =>
    Number(hour) >= 12 ? "PM" : "AM",
  );
  function updateLocalTime(
    nextDate: string,
    nextHour: string,
    nextMinute: string,
  ) {
    setAppointment({
      ...appointment,
      localDateTime: `${nextDate}T${nextHour}:${nextMinute}`,
    });
  }
  const [validationError, setValidationError] = useState("");
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
            if (scheduling && (!date || !hour || !minute)) {
              setValidationError(
                "Choose the interview date, hour, and minute.",
              );
              document
                .getElementById(
                  !date
                    ? "appointment-date"
                    : !hour
                      ? "appointment-hour"
                      : "appointment-minute",
                )
                ?.focus();
              return;
            }
            if (["decide", "correct_decision"].includes(action) && !outcome) {
              setValidationError("Choose Interview passed or Not selected.");
              document.getElementById("outcome-passed")?.focus();
              return;
            }
            setValidationError("");
            void onSave(values());
          }}
        >
          <DialogHeader>
            <DialogTitle>{operation.title}</DialogTitle>
            <DialogDescription>
              {feedback
                ? `Record ${operation.interviewer}’s assessment. Save a draft while working, then submit when it is complete.`
                : (INTERVIEW_OPERATION_COPY[action]?.description ??
                  "Record this interview action.")}
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            {scheduling && (
              <>
                {action === "schedule" && (
                  <>
                    <InterviewField id="round-name" label="Round title">
                      <Input
                        id="round-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        minLength={2}
                        maxLength={160}
                        placeholder="e.g. HR interview or Manager interview"
                        autoFocus
                      />
                    </InterviewField>
                    <InterviewField
                      id="round-interviewers"
                      label="Who will interview? (one name per line)"
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
                  <InterviewField id="appointment-date" label="Interview date">
                    <DatePicker
                      id="appointment-date"
                      value={date ?? ""}
                      required
                      disabled={busy}
                      onValueChange={(value) =>
                        updateLocalTime(value, hour, minute)
                      }
                    />
                  </InterviewField>
                  <div className="grid grid-cols-3 gap-2">
                    <InterviewField id="appointment-hour" label="Hour">
                      <SelectField
                        id="appointment-hour"
                        value={hour12(hour)}
                        placeholder="Hour"
                        className="w-full"
                        disabled={busy}
                        onValueChange={(value) =>
                          updateLocalTime(
                            date ?? "",
                            hour24(value, period),
                            minute,
                          )
                        }
                      >
                        {Array.from({ length: 12 }, (_, i) =>
                          String(i + 1),
                        ).map((value) => (
                          <SelectFieldOption key={value} value={value}>
                            {value}
                          </SelectFieldOption>
                        ))}
                      </SelectField>
                    </InterviewField>
                    <InterviewField id="appointment-minute" label="Minute">
                      <SelectField
                        id="appointment-minute"
                        value={minute}
                        placeholder="Minute"
                        className="w-full"
                        disabled={busy}
                        onValueChange={(value) =>
                          updateLocalTime(date ?? "", hour, value)
                        }
                      >
                        {Array.from({ length: 60 }, (_, i) =>
                          String(i).padStart(2, "0"),
                        ).map((value) => (
                          <SelectFieldOption key={value} value={value}>
                            {value}
                          </SelectFieldOption>
                        ))}
                      </SelectField>
                    </InterviewField>
                    <InterviewField id="appointment-period" label="AM / PM">
                      <SelectField
                        id="appointment-period"
                        value={period}
                        className="w-full"
                        disabled={busy}
                        onValueChange={(value) => {
                          const next = value as "AM" | "PM";
                          setPeriod(next);
                          if (hour !== "")
                            updateLocalTime(
                              date ?? "",
                              hour24(hour12(hour), next),
                              minute,
                            );
                        }}
                      >
                        <SelectFieldOption value="AM">AM</SelectFieldOption>
                        <SelectFieldOption value="PM">PM</SelectFieldOption>
                      </SelectField>
                    </InterviewField>
                  </div>
                </div>
                <InterviewField id="appointment-timezone" label="Timezone">
                  <SelectField
                    id="appointment-timezone"
                    value={appointment.timezone}
                    className="w-full"
                    disabled={busy}
                    onValueChange={(timezone) =>
                      setAppointment({ ...appointment, timezone })
                    }
                  >
                    {[...new Set([appointment.timezone, ...TIMEZONES])].map(
                      (zone) => (
                        <SelectFieldOption key={zone} value={zone}>
                          {TIMEZONE_LABELS[zone] ?? zone.replaceAll("_", " ")}
                        </SelectFieldOption>
                      ),
                    )}
                  </SelectField>
                  <p className="text-xs text-muted-foreground">
                    Date and time use this timezone. Cambodia is selected by
                    default.
                  </p>
                </InterviewField>
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
                <div className="space-y-2">
                  <Label>Choose the final outcome</Label>
                  <RadioGroup
                    aria-label="Choose the final outcome"
                    value={outcome}
                    onValueChange={setOutcome}
                    className="gap-3"
                  >
                    {[
                      {
                        value: "passed",
                        label: "Interview passed",
                        text: "The candidate met the interview requirements. This does not mean hired.",
                      },
                      {
                        value: "not_selected",
                        label: "Not selected",
                        text: "The candidate will not proceed based on this interview assessment.",
                      },
                    ].map((item) => (
                      <Label
                        key={item.value}
                        htmlFor={`outcome-${item.value}`}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                      >
                        <RadioGroupItem
                          id={`outcome-${item.value}`}
                          value={item.value}
                          className="mt-1"
                        />
                        <span className="space-y-1">
                          <span className="block font-semibold">
                            {item.label}
                          </span>
                          <span className="block text-sm font-normal leading-relaxed text-muted-foreground">
                            {item.text}
                          </span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <p className="text-sm text-muted-foreground">
                  Interview passed does not mean Hired. Offers and onboarding
                  are outside interview management.
                </p>
              </>
            )}
            {needsReason && (
              <InterviewField
                id="action-reason"
                label={
                  INTERVIEW_OPERATION_COPY[action]?.reasonLabel ?? "Reason"
                }
              >
                <Textarea
                  id="action-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={10}
                  maxLength={2000}
                  placeholder={
                    INTERVIEW_OPERATION_COPY[action]?.placeholder ??
                    "Explain the reason (at least 10 characters)"
                  }
                />
              </InterviewField>
            )}
            {action === "hold" && (
              <InterviewField
                id="hold-follow-up"
                label="Follow-up date (optional)"
              >
                <DatePicker
                  id="hold-follow-up"
                  value={followUp}
                  onValueChange={setFollowUp}
                  disabled={busy}
                />
              </InterviewField>
            )}
            {action === "finish_rounds" && (
              <p className="text-sm">
                Next, you will choose Interview passed or Not selected and enter
                your reason. Earlier rounds and submitted feedback stay saved.
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
          {(error || validationError) && (
            <FeedbackAlert
              tone="error"
              title="Action could not be saved"
              description={error || validationError}
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
                  : (INTERVIEW_OPERATION_COPY[action]?.submit ??
                    operation.title)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
