"use client";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CRITERIA, RECOMMENDATIONS, type InterviewProcess } from "./interviews";
export function FinalReviewSummary({
  process,
  expanded,
}: {
  process: InterviewProcess;
  expanded: boolean;
}) {
  const assessments = process.rounds
    .filter((r) => r.status === "completed")
    .flatMap((round) =>
      round.feedback
        .filter((f) => f.status === "submitted")
        .map((feedback) => ({ round, feedback })),
    );
  if (!assessments.length) return null;
  const totals = Object.keys(RECOMMENDATIONS).map((key) => ({
    key: key as keyof typeof RECOMMENDATIONS,
    count: assessments.filter(
      (a) => a.feedback.scorecard.recommendation === key,
    ).length,
  }));
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={expanded ? "review" : undefined}
      className="rounded-lg border px-4"
    >
      <AccordionItem value="review" className="border-0">
        <AccordionTrigger className="gap-2 text-left">
          Review submitted assessments ({assessments.length})
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Compare the evidence across rounds before deciding. Drafts are
            excluded. Recommendations are individual assessments, not votes or a
            final outcome.
          </p>
          <div className="flex flex-wrap gap-2">
            {totals
              .filter((t) => t.count)
              .map((t) => (
                <Badge key={t.key} variant="secondary">
                  {RECOMMENDATIONS[t.key]} · {t.count}
                </Badge>
              ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Round / interviewer</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead>Strengths</TableHead>
                  <TableHead>Concerns</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map(({ round, feedback }) => (
                  <TableRow key={round.id + feedback.interviewer}>
                    <TableCell className="min-w-36 align-top whitespace-normal">
                      <p className="font-medium">{feedback.interviewer}</p>
                      <p className="text-xs text-muted-foreground">
                        {round.name}
                      </p>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      {RECOMMENDATIONS[feedback.scorecard.recommendation]}
                    </TableCell>
                    <TableCell className="min-w-40 max-w-64 whitespace-pre-wrap break-words align-top">
                      {feedback.scorecard.strengths || "Not recorded"}
                    </TableCell>
                    <TableCell className="min-w-40 max-w-64 whitespace-pre-wrap break-words align-top">
                      {feedback.scorecard.concerns || "Not recorded"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {assessments.map(({ round, feedback }) => (
              <div
                key={round.id + feedback.interviewer}
                className="space-y-3 rounded-md bg-muted/40 p-3"
              >
                <div className="space-y-1">
                  <p className="break-words font-medium">
                    {feedback.interviewer} · {round.name}
                  </p>
                  <Badge variant="outline">
                    {RECOMMENDATIONS[feedback.scorecard.recommendation]}
                  </Badge>
                </div>
                <dl className="space-y-3">
                  {(["strengths", "concerns"] as const).map((field) => (
                    <div key={field} className="space-y-1">
                      <dt className="text-xs font-medium text-muted-foreground">
                        {field === "strengths" ? "Strengths" : "Concerns"}
                      </dt>
                      <dd className="whitespace-pre-wrap break-words text-sm">
                        {feedback.scorecard[field] || "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <Accordion type="single" collapsible>
            {assessments.map(({ round, feedback }) => (
              <AccordionItem
                key={round.id + feedback.interviewer}
                value={round.id + feedback.interviewer}
              >
                <AccordionTrigger className="text-left">
                  Scorecard: {feedback.interviewer} · {round.name}
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {CRITERIA.map((criterion, index) => (
                      <div key={criterion} className="space-y-1">
                        <dt className="text-xs text-muted-foreground">
                          {criterion}
                        </dt>
                        <dd className="font-medium">
                          {feedback.scorecard.ratings[index] == null
                            ? "Not assessed"
                            : `${feedback.scorecard.ratings[index]} / 5`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="font-medium">Job-related notes</p>
                  <p className="whitespace-pre-wrap break-words">
                    {feedback.scorecard.notes || "Not recorded"}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
