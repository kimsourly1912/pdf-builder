"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STEP_GROUPS, displayNode } from "./workspace-tools";
import { STEP_ICONS } from "./workflow-canvas";
import { outcomes } from "./editor-tools";
import {
  STEP_LABELS,
  STEP_DESCRIPTIONS,
  type StepKind,
  type WorkflowGraph,
} from "./workflow";
export function StepCatalog({
  graph,
  source,
  outcome,
  disabled,
  onAdd,
  onFocus,
}: {
  graph: WorkflowGraph;
  source?: string;
  outcome?: string;
  disabled: boolean;
  onAdd: (kind: StepKind) => void;
  onFocus: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const parent = graph.nodes.find((n) => n.id === source),
    edge = graph.edges.find(
      (e) => e.source === source && e.outcome === (outcome ?? "next"),
    );
  const rejected = parent?.kind === "review_resume" && outcome === "rejected";
  const next: Partial<Record<StepKind, StepKind>> = {
    resume_uploaded: "extract_resume",
    extract_resume: "review_resume",
    review_resume: "create_account",
    create_account: "link_resume",
    link_resume: "assign_forms",
    assign_forms: "send_telegram",
    send_telegram: "complete",
  };
  const recommended = rejected
    ? "stop"
    : parent
      ? next[parent.kind]
      : undefined;
  const groups = STEP_GROUPS.map((group) => ({
    ...group,
    kinds: group.kinds.filter(
      (kind) =>
        (!rejected || kind === "stop") &&
        (STEP_LABELS[kind] + STEP_DESCRIPTIONS[kind])
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
  }));
  return (
    <div className="space-y-3">
      <Input
        autoFocus
        aria-label="Search steps"
        placeholder="Search steps…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {parent && (
        <p className="text-xs text-muted-foreground">
          After {displayNode(parent)} · {outcome ?? "next"}
        </p>
      )}
      {groups.map(
        (group) =>
          group.kinds.length > 0 && (
            <section key={group.name}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                {group.name}
              </h3>
              <div className="space-y-2">
                {group.kinds.map((kind) => {
                  const Icon = STEP_ICONS[kind],
                    terminalBlocked = !!edge && !outcomes(kind).length;
                  return (
                    <button
                      key={kind}
                      type="button"
                      draggable={!disabled && !terminalBlocked}
                      disabled={disabled || terminalBlocked}
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/pdfstudio-step",
                          kind,
                        )
                      }
                      onClick={() => onAdd(kind)}
                      className="flex w-full gap-3 rounded-lg border p-3 text-left hover:bg-muted disabled:opacity-50"
                    >
                      <Icon className="mt-1 size-5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {STEP_LABELS[kind]}{" "}
                          {kind === recommended && !terminalBlocked && (
                            <span className="text-xs text-primary">
                              · Suggested
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {terminalBlocked
                            ? "Disconnect the existing output before adding an end step."
                            : STEP_DESCRIPTIONS[kind]}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ),
      )}
      {!groups.some((g) => g.kinds.length) && (
        <p className="text-sm">No matching steps. Try another search.</p>
      )}
      {rejected && edge && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onFocus(edge.target)}
        >
          Open connected Stop
        </Button>
      )}
    </div>
  );
}
