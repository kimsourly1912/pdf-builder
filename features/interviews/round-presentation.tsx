"use client";

import { CalendarDays, Clock3, MapPin, Video, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/patterns/status-badge";
import { appointmentLabels } from "./appointment-presentation";
import {
  CRITERIA,
  RECOMMENDATIONS,
  missingFeedback,
  type InterviewRound,
} from "./interviews";

export function RoundAppointment({ round }: { round: InterviewRound }) {
  const { appointment } = round;
  const labels = appointmentLabels(appointment);
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            Date & time
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{labels.date}</span>
            <Badge variant="secondary" className="text-sm tabular-nums">
              {labels.time}
            </Badge>
            <Badge variant="outline">
              <Clock3 aria-hidden="true" />
              {appointment.duration} min
            </Badge>
          </dd>
          <dd className="break-words text-xs text-muted-foreground">
            Timezone: {appointment.timezone.replaceAll("_", " ")} (
            {labels.offset})
          </dd>
        </div>
        <div className="min-w-0 space-y-2">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            {appointment.kind === "online" ? (
              <Video className="size-4" aria-hidden="true" />
            ) : (
              <MapPin className="size-4" aria-hidden="true" />
            )}
            {appointment.kind === "online"
              ? "Online interview"
              : "In-person interview"}
          </dt>
          <dd className="break-words text-sm font-medium">
            {appointment.kind === "online" ? (
              <a
                href={appointment.location}
                className="underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                Join meeting
              </a>
            ) : (
              appointment.location
            )}
          </dd>
        </div>
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <UsersRound className="size-4" aria-hidden="true" />
            Interviewers
          </dt>
          <dd className="flex flex-wrap gap-2">
            {round.interviewers.map((name) => (
              <Badge
                key={name}
                variant="outline"
                className="max-w-full whitespace-normal break-words py-1"
              >
                {name}
              </Badge>
            ))}
          </dd>
        </div>
      </dl>
      {appointment.notes && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Preparation notes</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">
            {appointment.notes}
          </p>
        </div>
      )}
    </div>
  );
}

export function RoundFeedback({
  round,
  editable,
  busy,
  onEdit,
}: {
  round: InterviewRound;
  editable: boolean;
  busy: boolean;
  onEdit: (interviewer: string, draft: boolean) => void;
}) {
  const missing = missingFeedback(round);
  return (
    <div className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Interviewer feedback</h4>
        <StatusBadge
          tone={missing.length ? "warning" : "success"}
          label={`${round.interviewers.length - missing.length} of ${round.interviewers.length} submitted`}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {missing.length
          ? `Waiting for ${missing.join(", ")}. Drafts still need to be submitted.`
          : "All feedback is submitted. Review each interviewer’s assessment below."}
      </p>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {round.interviewers.map((interviewer) => {
          const feedback = round.feedback.find(
            (item) => item.interviewer === interviewer,
          );
          const submitted = feedback?.status === "submitted";
          return (
            <section
              key={interviewer}
              aria-label={`Feedback from ${interviewer}`}
              className="min-w-0 rounded-lg border bg-background"
            >
              <div className="space-y-3 border-b p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="min-w-0 break-words font-semibold">
                    {interviewer}
                  </h5>
                  <StatusBadge
                    tone={submitted ? "success" : "warning"}
                    label={
                      submitted
                        ? "Submitted"
                        : feedback
                          ? "Draft"
                          : "Not started"
                    }
                  />
                </div>
                {feedback && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Recommendation
                    </span>
                    <StatusBadge
                      tone={
                        feedback.scorecard.recommendation === "proceed"
                          ? "success"
                          : feedback.scorecard.recommendation ===
                              "do_not_proceed"
                            ? "danger"
                            : "warning"
                      }
                      label={RECOMMENDATIONS[feedback.scorecard.recommendation]}
                    />
                  </div>
                )}
                {editable && !submitted && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onEdit(interviewer, !!feedback)}
                  >
                    {feedback ? "Edit draft" : "Record feedback"}
                  </Button>
                )}
              </div>
              {feedback ? (
                <div className="space-y-5 p-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Assessment scores</p>
                    <p className="text-xs text-muted-foreground">
                      1 = limited evidence · 5 = strong evidence
                    </p>
                    <dl className="divide-y">
                      {CRITERIA.map((criterion, index) => {
                        const rating = feedback.scorecard.ratings[index];
                        return (
                          <div
                            key={criterion}
                            className="flex items-center justify-between gap-3 py-3 text-sm"
                          >
                            <dt className="min-w-0 break-words text-muted-foreground">
                              {criterion}
                            </dt>
                            <dd className="shrink-0">
                              <Badge
                                variant={
                                  rating === null ? "outline" : "secondary"
                                }
                                aria-label={
                                  rating === null
                                    ? "Not assessed"
                                    : `${rating} out of 5`
                                }
                                className="tabular-nums"
                              >
                                {rating === null ? (
                                  "Not assessed"
                                ) : (
                                  <>
                                    <span className="font-semibold">
                                      {rating}
                                    </span>
                                    <span className="text-muted-foreground">
                                      / 5
                                    </span>
                                  </>
                                )}
                              </Badge>
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                  {(
                    [
                      ["notes", "Interview notes"],
                      ["strengths", "Strengths"],
                      ["concerns", "Concerns"],
                    ] as const
                  ).map(
                    ([key, label]) =>
                      feedback.scorecard[key] && (
                        <div key={key} className="space-y-1 text-sm">
                          <h6 className="font-medium">{label}</h6>
                          <p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                            {feedback.scorecard[key]}
                          </p>
                        </div>
                      ),
                  )}
                  <p className="break-words border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    Entered by {feedback.enteredBy}
                    <br />
                    {new Date(feedback.updatedAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: round.appointment.timezone,
                    })}{" "}
                    · {round.appointment.timezone.replaceAll("_", " ")}
                  </p>
                </div>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No feedback recorded yet.
                </p>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Recommendations are each interviewer’s view. The final decision is
        recorded separately.
      </p>
    </div>
  );
}
