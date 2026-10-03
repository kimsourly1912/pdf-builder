import type { WorkflowGraph } from "./workflow";
import { workflowBusinessSummary } from "./business-summary";
export function BusinessSummaryCard({
  graph,
  title,
}: {
  graph: WorkflowGraph;
  title: string;
}) {
  const summary = workflowBusinessSummary(graph);
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium">When</p>
          <p className="mt-1 text-muted-foreground">{summary.when}</p>
        </div>
        <div>
          <p className="font-medium">
            Actions{summary.conditional ? " on the applicable branch" : ""}
          </p>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {summary.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
            {!summary.actions.length && (
              <li>No preparation actions configured.</li>
            )}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Publishing enables future matching events; it does not replay existing
        candidates. Manual preparation starts only when HR chooses it. Review
        gates and conditions determine which actions run.
      </p>
    </section>
  );
}
