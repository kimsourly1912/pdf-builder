"use client";

import { CheckCircle2, Circle } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  REQUIREMENTS,
  type HiringApplication,
  type HiringStage,
  type Requirement,
} from "./hiring";
import type { ApplicationTab } from "./tasks";

const actions: Record<Requirement, { label: string; tab: ApplicationTab }> = {
  cv_approved: { label: "Review CV", tab: "documents" },
  preparation_ready: { label: "Review preparation", tab: "documents" },
  forms_submitted: { label: "View forms", tab: "documents" },
  forms_accepted: { label: "Review documents", tab: "documents" },
  interview_complete: { label: "View interviews", tab: "interviews" },
};

export function ApplicationChecklist({
  app,
  stage,
  facts,
  onTab,
  onAssign,
}: {
  app: HiringApplication;
  stage: HiringStage | undefined;
  facts: Record<Requirement, boolean> & {
    documentCounts: { required: number; submitted: number; accepted: number };
  };
  onTab: (tab: ApplicationTab) => void;
  onAssign: () => void;
}) {
  const configured = [
    ...new Set([...(stage?.entry ?? []), ...(stage?.exit ?? [])]),
  ];
  const required = [...new Set<Requirement>(["cv_approved", ...configured])];
  const additional = (Object.keys(REQUIREMENTS) as Requirement[]).filter(
    (key) => !required.includes(key),
  );
  const completed =
    Number(!!app.jobId) + required.filter((key) => facts[key]).length;
  const locked = !!app.hold || !!app.outcome;
  return (
    <section
      className="min-w-0 space-y-4 rounded-xl border bg-card p-5"
      aria-labelledby="application-checklist-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="application-checklist-title" className="font-semibold">
          Application checklist
        </h2>
        <span className="text-xs text-muted-foreground">
          {completed} of {required.length + 1} recorded
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {stage
          ? `Job and CV review, plus the requirements configured for ${stage.name}. Destination stages may have additional requirements.`
          : "Job and CV review. Stage requirements are unavailable; refresh before reviewing a stage move."}
      </p>
      {locked && (
        <p className="rounded-md bg-muted p-3 text-sm">
          {app.outcome
            ? "This application is closed."
            : "This application is on hold."}{" "}
          Existing evidence is available to review.
        </p>
      )}
      <ul className="divide-y">
        <ChecklistRow
          complete={!!app.jobId}
          label="Job assigned"
          detail={
            app.jobId ? app.jobTitle : "Choose the job this application is for."
          }
          status={app.jobId ? "Recorded" : "Needs assignment"}
        >
          {!app.jobId && !locked && (
            <Button variant="outline" size="sm" onClick={onAssign}>
              Choose job
            </Button>
          )}
        </ChecklistRow>
        {required.map((key) => {
          const complete = facts[key];
          const scopes = [
            stage?.entry.includes(key) ? "Required to enter this stage" : "",
            stage?.exit.includes(key) ? "Required to leave this stage" : "",
          ].filter(Boolean);
          const status = complete
            ? "Recorded"
            : key === "forms_submitted"
              ? facts.documentCounts.required
                ? "Waiting for submission"
                : "No forms linked"
              : key === "forms_accepted"
                ? facts.documentCounts.required
                  ? "Needs document review"
                  : "No forms linked"
                : key === "cv_approved"
                  ? "Needs CV review"
                  : key === "preparation_ready"
                    ? "Needs preparation"
                    : "Not completed";
          return (
            <ChecklistRow
              key={key}
              complete={complete}
              label={REQUIREMENTS[key]}
              detail={scopes.join(" · ") || "Application review"}
              status={status}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => onTab(actions[key].tab)}
              >
                {complete ? "View details" : actions[key].label}
              </Button>
            </ChecklistRow>
          );
        })}
      </ul>
      {stage && !configured.length && (
        <p className="text-sm text-muted-foreground">
          This stage has no additional entry or exit requirements. Moving stages
          does not approve evidence or record a hiring decision.
        </p>
      )}
      {!!additional.length && (
        <details className="rounded-lg border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            Additional evidence ({additional.length})
          </summary>
          <p className="mt-3 text-xs text-muted-foreground">
            {stage
              ? "These items are not configured entry or exit requirements for this stage. An unrecorded item here does not by itself block a stage move."
              : "Stage requirements are unavailable. This evidence is shown for reference."}
          </p>
          <ul className="mt-3 space-y-3 text-sm">
            {additional.map((key) => (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>{REQUIREMENTS[key]}</span>
                <Badge variant="outline">
                  {facts[key] ? "Recorded" : "Not recorded"}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ChecklistRow({
  complete,
  label,
  detail,
  status,
  children,
}: {
  complete: boolean;
  label: string;
  detail: string;
  status: string;
  children?: ReactNode;
}) {
  const Icon = complete ? CheckCircle2 : Circle;
  return (
    <li className="flex flex-wrap items-start gap-3 py-4">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 size-5 shrink-0 ${complete ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        <Badge
          variant="outline"
          className={
            complete
              ? "text-green-700 dark:text-green-400"
              : "text-amber-800 dark:text-amber-300"
          }
        >
          {status}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </li>
  );
}
