"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { STEP_ICONS } from "./workflow-canvas";
import { nodeIssues } from "./editor-tools";
import { displayNode } from "./workspace-tools";
import type { WorkflowGraph } from "./workflow";

export function WorkflowOutline({
  graph,
  onSelect,
}: {
  graph: WorkflowGraph;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const visited = new Set<string>();
  const ordered: typeof graph.nodes = [];
  const visit = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    if (!node || visited.has(id)) return;
    visited.add(id);
    ordered.push(node);
    graph.edges.filter((e) => e.source === id).forEach((e) => visit(e.target));
  };
  const start = graph.nodes.find((n) => n.kind === "resume_uploaded");
  if (start) visit(start.id);
  const reached = new Set(visited);
  graph.nodes.forEach((n) => visit(n.id));
  const matches = ordered.filter((n) =>
    `${displayNode(n)} ${n.note ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <Input
        autoFocus
        aria-label="Find workflow step"
        placeholder="Find a step…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ul className="space-y-2" aria-label="Workflow steps">
        {matches.map((node) => {
          const Icon = STEP_ICONS[node.kind];
          const problems = nodeIssues(graph, node);
          const next = graph.edges.filter((e) => e.source === node.id);
          return (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 space-y-1">
                  <span className="block break-words text-sm font-medium">
                    {displayNode(node)}
                  </span>
                  {!reached.has(node.id) && (
                    <span className="block text-xs text-warning-foreground">
                      Not connected to the start
                    </span>
                  )}
                  {problems.length > 0 && (
                    <span className="block text-xs text-warning-foreground">
                      Needs setup · {problems.length}{" "}
                      {problems.length === 1 ? "issue" : "issues"}
                    </span>
                  )}
                  {next.map((edge) => {
                    const target = graph.nodes.find((n) => n.id === edge.target);
                    return (
                      <span key={edge.id} className="block break-words text-xs text-muted-foreground">
                        {edge.outcome === "next" ? "Next" : edge.outcome} →{" "}
                        {target ? displayNode(target) : "Missing step"}
                      </span>
                    );
                  })}
                  {node.kind === "complete" || node.kind === "stop" ? (
                    <span className="block text-xs text-muted-foreground">Ends this path</span>
                  ) : !next.length && (
                    <span className="block text-xs text-muted-foreground">Choose the next step</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!matches.length && (
        <p className="text-sm text-muted-foreground">No matching steps. Try another search.</p>
      )}
    </div>
  );
}
