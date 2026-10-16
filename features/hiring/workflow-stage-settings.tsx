"use client";
import Link from "next/link";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { StepConfig, WorkflowNode } from "@/features/workflows/workflow";
import { useHiringConfiguration } from "./client";
import { isApplicationTrigger } from "./hiring";
export function WorkflowStageSettings({
  node,
  pipelineVersionId,
  onChange,
}: {
  node: WorkflowNode;
  pipelineVersionId?: string;
  onChange: (config: StepConfig) => void;
}) {
  const { config, error, reload } = useHiringConfiguration(),
    settings = node.config;
  const versionId =
    node.kind === "resume_uploaded"
      ? settings.pipelineVersionId
      : pipelineVersionId;
  const version = config?.versions.find((v) => v.id === versionId);
  const patch = (values: Partial<StepConfig>) =>
    onChange({ ...settings, ...values });
  const stages = version?.definition.stages ?? [];
  const stageSelect = (
    id: string,
    label: string,
    value: string | undefined,
    change: (v: string) => void,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <SelectField
        id={id}
        value={value ?? ""}
        onValueChange={change}
        placeholder="Choose stage"
        disabled={!version}
      >
        {stages.map((s) => (
          <SelectFieldOption key={s.id} value={s.id}>
            {s.name}
          </SelectFieldOption>
        ))}
      </SelectField>
    </div>
  );
  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
          <Button variant="link" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        </p>
      )}
      {node.kind === "resume_uploaded" &&
        isApplicationTrigger(settings.trigger ?? "") && (
          <>
            <div className="space-y-2">
              <Label htmlFor="workflow-hiring-pipeline">
                Published hiring pipeline
              </Label>
              <SelectField
                id="workflow-hiring-pipeline"
                value={settings.pipelineVersionId ?? ""}
                onValueChange={(v) =>
                  patch({ pipelineVersionId: v, stageId: "" })
                }
                placeholder="Choose pipeline version"
              >
                {config?.versions
                  .filter((v) => !v.archived)
                  .map((v) => (
                    <SelectFieldOption key={v.id} value={v.id}>
                      {v.name} · v{v.version}
                    </SelectFieldOption>
                  ))}
              </SelectField>
            </div>
            {["stage_entered", "stage_left"].includes(settings.trigger ?? "") &&
              stageSelect(
                "workflow-trigger-stage",
                settings.trigger === "stage_left"
                  ? "Stage being left"
                  : "Stage being entered",
                settings.stageId,
                (v) =>
                  patch({
                    stageId: v,
                    stageLabel: stages.find((s) => s.id === v)?.name,
                  }),
              )}
          </>
        )}
      {node.kind === "move_stage" && (
        <>
          {stageSelect(
            "workflow-source-stage",
            "Expected current stage",
            settings.fromStageId,
            (v) =>
              patch({
                fromStageId: v,
                fromStageLabel: stages.find((s) => s.id === v)?.name,
              }),
          )}
          {stageSelect(
            "workflow-destination-stage",
            "Move to stage",
            settings.stageId,
            (v) =>
              patch({
                stageId: v,
                stageLabel: stages.find((s) => s.id === v)?.name,
              }),
          )}
          <p className="text-xs text-muted-foreground">
            Checks live requirements and application revisions. Moving never
            approves a CV or sends an invitation.
          </p>
        </>
      )}
      {node.kind === "condition" &&
        settings.field === "stageId" &&
        stageSelect("condition-value", "Stage", settings.value, (v) =>
          patch({
            value: v,
            valueLabel:
              settings.field === "stageId"
                ? stages.find((s) => s.id === v)?.name
                : config?.jobs.find((j) => j.id === v)?.title,
          }),
        )}
      {node.kind === "condition" && settings.field === "jobId" && (
        <div className="space-y-2">
          <Label htmlFor="condition-value">Job opening</Label>
          <SelectField
            id="condition-value"
            value={settings.value ?? ""}
            onValueChange={(v) =>
              patch({
                value: v,
                valueLabel:
                  settings.field === "stageId"
                    ? stages.find((s) => s.id === v)?.name
                    : config?.jobs.find((j) => j.id === v)?.title,
              })
            }
            placeholder="Choose job"
            disabled={!version}
          >
            {config?.jobs
              .filter((j) => !j.archived && j.pipelineVersionId === versionId)
              .map((j) => (
                <SelectFieldOption key={j.id} value={j.id}>
                  {j.title}
                </SelectFieldOption>
              ))}
          </SelectField>
        </div>
      )}
      {!version && node.kind !== "resume_uploaded" && (
        <p className="text-xs text-muted-foreground">
          Choose an application starting event and published pipeline in the
          first step.
        </p>
      )}
      <Link href="/hiring/pipelines" className="text-xs underline">
        Manage hiring stages and jobs
      </Link>
    </div>
  );
}
