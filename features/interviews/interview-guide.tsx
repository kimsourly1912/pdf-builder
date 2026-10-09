"use client";
import { BookOpen } from "lucide-react";
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
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { interviewDetailGuidance } from "./detail-guidance";
import type { InterviewProcess } from "./interviews";
const steps = [
  {
    title: "Schedule an interview",
    text: "Choose a round title (such as HR interview), interviewers, date, AM/PM time, timezone and location or meeting link. Save, then notify the candidate separately. Scheduling does not send an invitation.",
  },
  {
    title: "Record attendance",
    text: "After the scheduled start, choose Interview took place if the interview happened. If the candidate did not attend, choose Candidate did not attend (no-show) in the round’s More actions menu. A no-show does not reject the candidate; you can reschedule.",
  },
  {
    title: "Collect each interviewer’s feedback",
    text: "Record scores from 1 (limited evidence) to 5 (strong evidence), or Not assessed if you did not evaluate a criterion. Add notes, strengths, concerns and a recommendation. Save draft to continue later; choose Submitted when finished. Every named interviewer needs submitted feedback. Submitted feedback is retained and cannot be edited.",
  },
  {
    title: "Finish rounds or schedule another",
    text: "When all required feedback is submitted and no appointment is pending, choose Finish rounds & review. If you need more information, schedule another round instead. A recommendation is an interviewer’s view, not the final decision.",
  },
  {
    title: "Record the final decision",
    text: "Choose Interview passed or Not selected and give a meaningful reason. Interview passed does not mean hired. The process moves to Closed after the final decision.",
  },
];
export function InterviewGuide({ process }: { process: InterviewProcess }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen aria-hidden="true" />
          Interview guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How interviews work</DialogTitle>
          <DialogDescription>
            Follow these steps, then use the extra actions when plans change.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-muted p-3 text-sm">
          <span className="font-medium">Your next step: </span>
          {interviewDetailGuidance(process).label}
        </div>
        <ol className="space-y-4">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <Badge
                variant="outline"
                className="size-7 shrink-0 justify-center"
              >
                {index + 1}
              </Badge>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <Accordion type="multiple" className="border-t">
          <AccordionItem value="appointment">
            <AccordionTrigger>
              Reschedule or cancel an appointment
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>Reschedule:</strong> change the date, time or location
                and record why. Earlier appointment details stay in History.
              </p>
              <p>
                <strong>Cancel appointment:</strong> cancel this round’s
                appointment with a reason. This does not close the candidate’s
                interview process.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="pause">
            <AccordionTrigger>
              Put interviews on hold or record withdrawal
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Use the process’s <strong>More actions</strong> menu.
              </p>
              <p>
                <strong>Put on hold:</strong> pause with a reason and optional
                follow-up date. Resume interviews returns to the previous step;
                it does not schedule a reminder.
              </p>
              <p>
                <strong>Record candidate withdrawal:</strong> use when the
                candidate no longer wants to continue. A reason is required and
                the process moves to Closed.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="reopen">
            <AccordionTrigger>
              Correct a decision or reopen interviews
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                For a closed process, use <strong>More actions</strong>.
              </p>
              <p>
                <strong>Correct final decision:</strong> fix a recorded
                Interview passed / Not selected outcome with a reason.
              </p>
              <p>
                <strong>Reopen interviews:</strong> continue reviewing a closed
                or withdrawn process with a reason. Earlier outcomes stay in
                History. For reassessment, add a new round rather than changing
                submitted feedback.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="review">
            <AccordionTrigger>
              Review documents and history without leaving
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>Documents:</strong> preview the original CV, linked
                account and accepted form answers or PDF. Close the preview to
                return to the interview.
              </p>
              <p>
                <strong>History:</strong> scan the compact table; open Details
                to read the full reason and earlier appointment or decision.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
