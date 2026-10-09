"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { StatusBadge } from "@/components/patterns/status-badge";
import {
  INTERVIEW_ACTION_LABELS,
  INTERVIEW_LABELS,
  appointmentDisplay,
  type Appointment,
  type InterviewProcess,
} from "./interviews";
type Activity = InterviewProcess["activity"][number];
function summary(event: Activity) {
  if (typeof event.details.interviewer === "string")
    return event.details.interviewer;
  if (typeof event.details.reason === "string" && event.details.reason)
    return event.details.reason;
  if (typeof event.details.name === "string") return event.details.name;
  return "Recorded in interview history";
}
export function InterviewHistory({ process }: { process: InterviewProcess }) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Activity | null>(null);
  const totalPages = Math.ceil(process.activity.length / 10),
    current = Math.min(page, Math.max(1, totalPages));
  const events = process.activity.slice((current - 1) * 10, current * 10);
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Activity history</h2>
        <p className="text-sm text-muted-foreground">
          Newest first. Open Details to see reasons and earlier appointments or
          decisions.
        </p>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableCaption className="sr-only">
            Interview activity, newest first
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead className="hidden md:table-cell">
                Recorded by
              </TableHead>
              <TableHead>Date & time</TableHead>
              <TableHead>
                <span className="sr-only">Details</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length ? (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="min-w-[140px] max-w-sm whitespace-normal">
                    <p className="text-sm font-medium">
                      {INTERVIEW_ACTION_LABELS[event.action] ??
                        "Interview updated"}
                    </p>
                    <p className="line-clamp-1 break-all text-xs text-muted-foreground">
                      {summary(event)}
                    </p>
                    {event.details.status === "draft" ||
                    event.details.status === "submitted" ? (
                      <StatusBadge
                        label={event.details.status}
                        tone={
                          event.details.status === "submitted"
                            ? "success"
                            : "warning"
                        }
                        className="mt-1"
                      />
                    ) : null}
                    <p className="break-all text-xs text-muted-foreground md:hidden">
                      {event.actor}
                    </p>
                  </TableCell>
                  <TableCell className="hidden max-w-[180px] whitespace-normal break-all text-xs text-muted-foreground md:table-cell">
                    {event.actor}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(event.at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <br />
                    {new Date(event.at).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      id={`history-detail-${event.id}`}
                      aria-label={`Details: ${INTERVIEW_ACTION_LABELS[event.action] ?? "Interview updated"}`}
                      onClick={() => setSelected(event)}
                    >
                      <Eye aria-hidden="true" />
                      <span className="hidden sm:inline">Details</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="p-6 text-center text-muted-foreground"
                >
                  No activity recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <ServerPagination
          meta={{
            page: current,
            pageSize: 10,
            totalItems: process.activity.length,
            totalPages,
            hasPreviousPage: current > 1,
            hasNextPage: current < totalPages,
          }}
          onPageChange={setPage}
        />
      </div>
      {selected && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          <DialogContent
            className="max-h-[85svh] overflow-y-auto sm:max-w-xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById(`history-detail-${selected.id}`)?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {INTERVIEW_ACTION_LABELS[selected.action] ??
                  "Interview updated"}
              </DialogTitle>
              <DialogDescription className="break-words">
                {selected.actor} ·{" "}
                {new Date(selected.at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </DialogDescription>
            </DialogHeader>
            <ActivityDetails event={selected} />
            <Button variant="outline" onClick={() => setSelected(null)}>
              Close details
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
function ActivityDetails({ event }: { event: Activity }) {
  const details = event.details;
  const previous = details.previousDecision as
    { outcome?: keyof typeof INTERVIEW_LABELS; reason?: string } | undefined;
  return (
    <dl className="space-y-4 text-sm">
      {typeof details.reason === "string" && details.reason && (
        <div className="space-y-1">
          <dt className="font-medium">Reason</dt>
          <dd className="whitespace-pre-wrap break-words text-muted-foreground">
            {details.reason}
          </dd>
        </div>
      )}
      {typeof details.interviewer === "string" && (
        <div className="space-y-1">
          <dt className="font-medium">Interviewer feedback</dt>
          <dd className="break-words">
            {details.interviewer} · {String(details.status)}
          </dd>
        </div>
      )}
      {(
        [
          ["previousAppointment", "Previous appointment"],
          ["appointment", "Recorded appointment"],
        ] as const
      ).map(
        ([key, label]) =>
          !!details[key] && (
            <div key={key} className="space-y-1">
              <dt className="font-medium">{label}</dt>
              <dd className="break-words text-muted-foreground">
                {appointmentDisplay(details[key] as Appointment)}
                <br />
                {(details[key] as Appointment).location}
              </dd>
            </div>
          ),
      )}
      {previous?.outcome && (
        <div className="space-y-1">
          <dt className="font-medium">Previous decision</dt>
          <dd className="whitespace-pre-wrap break-words text-muted-foreground">
            {INTERVIEW_LABELS[previous.outcome]}
            {previous.reason ? ` · ${previous.reason}` : ""}
          </dd>
        </div>
      )}
      {!details.reason &&
        !details.interviewer &&
        !details.appointment &&
        !details.previousAppointment &&
        !previous?.outcome && (
          <div>
            <dt className="font-medium">Details</dt>
            <dd className="break-words text-muted-foreground">
              {summary(event)}
            </dd>
          </div>
        )}
    </dl>
  );
}
