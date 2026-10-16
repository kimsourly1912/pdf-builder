"use client";
import { Checkbox } from "@/components/ui/checkbox";
import { SampleCanvas, type SampleResult } from "./sample-canvas";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { previewWorkflow, type SampleInput } from "./workspace-tools";
import type { WorkflowGraph, TemplateOption } from "./workflow";
import { useHiringConfiguration } from "@/features/hiring/client";
import { isApplicationTrigger } from "@/features/hiring/hiring";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
export function SampleTest({
  graph,
  options,
  onFocus,
  onShowPath,
  initialSample,
}: {
  graph: WorkflowGraph;
  options: TemplateOption[];
  onFocus?: (id: string) => void;
  onShowPath?: (result: SampleResult, sample: SampleInput) => void;
  initialSample?: SampleInput;
}) {
  const [sample, setSample] = useState<SampleInput>(
    initialSample ?? {
      name: "Dara Sok",
      email: "dara@example.com",
      source: "telegram",
      appliedPosition: "Accountant",
      approved: true,
      existingAccount: false,
      telegramConfirmed: true,
    },
  );
  const result = previewWorkflow(graph, sample, options);
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Preview only — no accounts, assignments, messages or paid AI calls
          will be created. Sample decisions do not approve a real CV.
        </AlertDescription>
      </Alert>
      <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
        <fieldset className="space-y-3">
          <legend className="mb-3 font-medium">Sample input</legend>
          {(
            [
              ["approved", "Sample HR decision: approved"],
              ["existingAccount", "Account already exists"],
              ["telegramConfirmed", "Telegram contact confirmed"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sample[key]}
                onCheckedChange={(checked) =>
                  setSample({ ...sample, [key]: checked === true })
                }
              />
              {label}
            </label>
          ))}
          <details
            className="rounded-lg border p-3"
            open={graph.nodes.some((n) => n.kind === "condition")}
          >
            <summary className="cursor-pointer text-sm font-medium">
              Candidate sample details
            </summary>
            <div className="mt-3 space-y-3">
              {(
                [
                  ["name", "Name"],
                  ["email", "Email"],
                  ["source", "CV source"],
                  ["appliedPosition", "Applied position"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`sample-${key}`}>{label}</Label>
                  <Input
                    id={`sample-${key}`}
                    value={sample[key] ?? ""}
                    maxLength={160}
                    onChange={(e) =>
                      setSample({ ...sample, [key]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
          </details>
          {isApplicationTrigger(
            graph.nodes.find((n) => n.kind === "resume_uploaded")?.config
              .trigger ?? "",
          ) && (
            <ApplicationSampleFields
              graph={graph}
              sample={sample}
              onChange={setSample}
            />
          )}
        </fieldset>
        <div className="min-w-0 space-y-3">
          <SampleCanvas graph={graph} result={result} onFocus={onFocus} />
          {onShowPath && (
            <Button onClick={() => onShowPath(result, sample)}>
              Show path on editor canvas
            </Button>
          )}
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Step-by-step result · {result.steps.length} steps
            </summary>
            <div className="mt-3 space-y-3">
              {result.steps.map((step, i) => (
                <div key={step.id} className="rounded-lg border p-3 text-sm">
                  {onFocus ? (
                    <Button
                      variant="link"
                      className="h-auto max-w-full whitespace-normal p-0 text-left"
                      onClick={() => onFocus(step.id)}
                    >
                      {i + 1}. {step.label}
                    </Button>
                  ) : (
                    <p className="font-medium">
                      {i + 1}. {step.label}
                    </p>
                  )}
                  <p className="mt-1">{step.result}</p>
                  {step.forms && (
                    <ul className="mt-2 list-disc pl-5">
                      {step.forms.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                  {step.message !== undefined && (
                    <div className="mt-3 rounded-lg bg-muted p-3">
                      <p className="whitespace-pre-wrap break-words">
                        {step.message || "Message is empty"}
                      </p>
                      <span className="mt-2 inline-block rounded border px-2 py-1 text-xs">
                        Activate account &amp; open forms · preview
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A preview does not verify account reuse, live contact, published form
        availability, or delivery. Live runs recheck requirements and approval.
      </p>
      {result.issues.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {result.issues.length} setup issues must be resolved before
            publishing.
            <ul className="mt-2 list-disc pl-5">
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function ApplicationSampleFields({
  graph,
  sample,
  onChange,
}: {
  graph: WorkflowGraph;
  sample: SampleInput;
  onChange: (v: SampleInput) => void;
}) {
  const { config } = useHiringConfiguration(),
    versionId = graph.nodes.find((n) => n.kind === "resume_uploaded")?.config
      .pipelineVersionId,
    version = config?.versions.find((v) => v.id === versionId);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sample-stage">Application stage</Label>
        <SelectField
          id="sample-stage"
          value={sample.stageId ?? ""}
          onValueChange={(v) => onChange({ ...sample, stageId: v })}
          placeholder="Choose sample stage"
        >
          {version?.definition.stages.map((s) => (
            <SelectFieldOption key={s.id} value={s.id}>
              {s.name}
            </SelectFieldOption>
          ))}
        </SelectField>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sample-job">Job opening</Label>
        <SelectField
          id="sample-job"
          value={sample.jobId ?? ""}
          onValueChange={(v) => onChange({ ...sample, jobId: v })}
          placeholder="Unassigned job"
        >
          <SelectFieldOption value="">Unassigned job</SelectFieldOption>
          {config?.jobs
            .filter((j) => j.pipelineVersionId === versionId)
            .map((j) => (
              <SelectFieldOption key={j.id} value={j.id}>
                {j.title}
              </SelectFieldOption>
            ))}
        </SelectField>
      </div>
    </div>
  );
}
