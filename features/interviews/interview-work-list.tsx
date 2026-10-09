"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/patterns/status-badge";
import { INTERVIEW_LABELS, type InterviewProcess } from "./interviews";
import { interviewWork, elapsedStage } from "./flow-presentation";
import { appointmentLabels } from "./appointment-presentation";

export function InterviewWorkList({ items }: { items: InterviewProcess[] }) {
  function status(process: InterviewProcess) {
    const work = interviewWork(process);
    return (
      <StatusBadge
        label={
          process.outcome
            ? INTERVIEW_LABELS[process.outcome]
            : process.hold
              ? "Interviews paused"
              : work.finalReview
                ? "Ready for decision"
                : INTERVIEW_LABELS[process.stage]
        }
        tone={
          process.outcome === "passed"
            ? "success"
            : process.outcome === "not_selected"
              ? "danger"
              : work.attention || process.hold
                ? "warning"
                : "info"
        }
      />
    );
  }
  function appointment(process: InterviewProcess) {
    const round = interviewWork(process).scheduled;
    if (!round)
      return (
        <span className="text-muted-foreground">No pending appointment</span>
      );
    const labels = appointmentLabels(round.appointment);
    return (
      <div className="space-y-1">
        <p>
          {labels.date} · {labels.time}
        </p>
        <p className="text-xs text-muted-foreground">
          {round.name} · {round.appointment.timezone.replaceAll("_", " ")}
        </p>
        {process.hold && (
          <p className="text-xs text-muted-foreground">
            Appointment retained during pause
          </p>
        )}
      </div>
    );
  }
  function action(process: InterviewProcess) {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-auto whitespace-normal py-2"
      >
        <Link href={`/interviews/${process.id}?task=next`}>
          {interviewWork(process).next.label}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    );
  }
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Status & time</TableHead>
              <TableHead>Appointment</TableHead>
              <TableHead>What needs attention</TableHead>
              <TableHead>Next action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((process) => (
              <TableRow key={process.id}>
                <TableCell className="max-w-64 align-top whitespace-normal">
                  <Link
                    href={`/interviews/${process.id}`}
                    className="break-words font-semibold hover:underline"
                  >
                    {process.snapshot.name}
                  </Link>
                  <p className="break-words text-xs text-muted-foreground">
                    {process.position}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {process.snapshot.email}
                  </p>
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <div className="space-y-2">
                    {status(process)}
                    <p
                      className="text-xs text-muted-foreground"
                      title={process.stageSince}
                    >
                      {elapsedStage(process.stageSince)} in this status
                    </p>
                  </div>
                </TableCell>
                <TableCell className="max-w-64 break-words align-top whitespace-normal">
                  {appointment(process)}
                </TableCell>
                <TableCell className="max-w-64 break-words align-top whitespace-normal">
                  <p>{interviewWork(process).blocker}</p>
                  {process.hold?.followUp && (
                    <p className="text-xs text-muted-foreground">
                      Follow up: {process.hold.followUp}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Owner: {process.responsible}
                  </p>
                </TableCell>
                <TableCell className="max-w-60 align-top whitespace-normal">
                  {action(process)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 md:hidden">
        {items.map((process) => (
          <article
            key={process.id}
            className="min-w-0 space-y-3 rounded-lg border bg-card p-4"
          >
            <div className="space-y-1">
              <Link
                href={`/interviews/${process.id}`}
                className="break-words font-semibold hover:underline"
              >
                {process.snapshot.name}
              </Link>
              <p className="break-words text-sm text-muted-foreground">
                {process.position} · {process.snapshot.email}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {status(process)}
              <span className="text-xs text-muted-foreground">
                {elapsedStage(process.stageSince)} in this status
              </span>
            </div>
            <div className="break-words text-sm">{appointment(process)}</div>
            <p className="break-words text-sm font-medium">
              {interviewWork(process).blocker}
            </p>
            {process.hold?.followUp && (
              <p className="text-xs text-muted-foreground">
                Follow up: {process.hold.followUp}
              </p>
            )}
            <p className="break-words text-xs text-muted-foreground">
              Owner: {process.responsible}
            </p>
            {action(process)}
          </article>
        ))}
      </div>
    </>
  );
}
