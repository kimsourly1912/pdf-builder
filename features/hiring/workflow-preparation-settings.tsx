"use client";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { StepConfig } from "@/features/workflows/workflow";
export function WorkflowPreparationSettings({
  config,
  onChange,
}: {
  config: StepConfig;
  onChange: (value: StepConfig) => void;
}) {
  const [items, setItems] = useState<
      {
        id: string;
        name: string;
        version: number;
        hasPreparation: boolean;
        active: boolean;
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void workflowApi<{ items: typeof items }>("/api/workflows", {
      signal: abort.signal,
    })
      .then((data) =>
        setItems(data.items.filter((w) => w.active && w.hasPreparation)),
      )
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorText(e));
      });
    return () => abort.abort();
  }, []);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="preparation-workflow">Preparation workflow</Label>
        <SelectField
          id="preparation-workflow"
          value={config.preparationWorkflowId ?? ""}
          onValueChange={(id) =>
            onChange({
              ...config,
              preparationWorkflowId: id,
              preparationWorkflowVersion: undefined,
            })
          }
          placeholder="Choose a published preparation"
        >
          {items.map((w) => (
            <SelectFieldOption key={w.id} value={w.id}>
              {w.name} · v{w.version}
            </SelectFieldOption>
          ))}
        </SelectField>
      </div>
      <p className="text-xs text-muted-foreground">
        Publication pins this preparation version. It starts once per
        application and CV, with independent required forms. Select Application
        workflows on the published hiring model or choose application preparation
        in CV & documents; account/contact review is still required before
        creating access or sending an invitation. Use
        the preparation-completed event for subsequent routing.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
