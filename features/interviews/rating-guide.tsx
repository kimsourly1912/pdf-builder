import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
export const RATING_LEVELS = {
  1: "Limited evidence — significant gaps",
  2: "Some evidence — support needed",
  3: "Meets the role’s requirements",
  4: "Strong evidence — above requirements",
  5: "Exceptional evidence — consistently exceeds requirements",
} as const;
export function RatingGuide() {
  return (
    <Accordion type="single" collapsible className="rounded-lg border px-4">
      <AccordionItem value="ratings" className="border-0">
        <AccordionTrigger>How to use the rating scale</AccordionTrigger>
        <AccordionContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Use the same role requirements for every candidate. Support scores
            with examples from this interview.
          </p>
          <dl className="space-y-2">
            {Object.entries(RATING_LEVELS).map(([score, label]) => (
              <div key={score} className="flex gap-3">
                <dt className="font-semibold">{score} / 5</dt>
                <dd className="flex-1">{label}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground">
            Not assessed means you did not evaluate that criterion. It is not a
            zero.
          </p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
