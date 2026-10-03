"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { previewWorkflow, type SampleInput } from "./workspace-tools";
import type { WorkflowGraph, TemplateOption } from "./workflow";
export function SampleTest({
  graph,
  options,
  onFocus,
}: {
  graph: WorkflowGraph;
  options: TemplateOption[];
  onFocus: (id: string) => void;
}) {
  const [sample, setSample] = useState<SampleInput>({
    name: "Dara Sok",
    email: "dara@example.com",
    source: "telegram",
    appliedPosition: "Accountant",
    approved: true,
    existingAccount: false,
    telegramConfirmed: true,
  });
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
              ["name", "Name"],
              ["email", "Email"],
              ["source", "CV source"],
              ["appliedPosition", "Applied position"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={`sample-${key}`}>{label}</Label>
              <Input
                id={`sample-${key}`}
                value={sample[key]}
                maxLength={160}
                onChange={(e) =>
                  setSample({ ...sample, [key]: e.target.value })
                }
              />
            </div>
          ))}
          {(
            [
              ["approved", "Sample HR decision: approved"],
              ["existingAccount", "Account already exists"],
              ["telegramConfirmed", "Telegram contact confirmed"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sample[key]}
                onChange={(e) =>
                  setSample({ ...sample, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="min-w-0 space-y-3">
          <h3 className="font-medium">Planned path</h3>
          {result.steps.map((step, i) => (
            <div key={step.id} className="rounded-lg border p-3 text-sm">
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() => onFocus(step.id)}
              >
                {i + 1}. {step.label}
              </Button>
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
