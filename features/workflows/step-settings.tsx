"use client";
import { SelectField, SelectFieldOption } from "@/components/patterns/select-field";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  STEP_LABELS,
  STEP_DESCRIPTIONS,
  TRIGGER_LABELS,
  type WorkflowNode,
  type StepConfig,
  type TemplateOption,
} from "./workflow";
import { DEFAULT_INVITATION } from "./editor-tools";
import { WorkflowStageSettings } from "@/features/hiring/workflow-stage-settings";
import { isApplicationTrigger } from "@/features/hiring/hiring";
export function StepSettings(props: {
  node: WorkflowNode;
  pipelineVersionId?: string;
  options: TemplateOption[];
  disabled?: boolean;
  onChange: (config: StepConfig) => void;
  onMetadata?: (metadata: { label?: string; note?: string }) => void;
}) {
  const { node } = props,
    config = node.config;
  const patch = (change: Partial<StepConfig>) =>
    props.onChange({ ...config, ...change });
  return (
    <fieldset disabled={props.disabled} className="space-y-5">
      <div>
        <h2 className="font-semibold">{STEP_LABELS[node.kind]}</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {STEP_DESCRIPTIONS[node.kind]}
        </p>
      </div>
      {node.kind === "resume_uploaded" && (
        <div className="space-y-2">
          <Label htmlFor="workflow-trigger">Starting event</Label>
          <SelectField
            id="workflow-trigger"
            value={config.trigger ?? "staff_upload"}
            className="h-10 w-full rounded border bg-background px-2 text-sm"
            onValueChange={(value) =>
              patch({ trigger: value as StepConfig["trigger"] })
            }
          >
            {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
              <SelectFieldOption key={value} value={value}>
                {label}
              </SelectFieldOption>
            ))}
          </SelectField>
          <p className="text-xs text-muted-foreground">
            Publishing activates this event. CV approval does not require AI
            extraction.
          </p>
        </div>
      )}
      {node.kind === "assign_forms" && (
        <div className="space-y-3">
          <Label>Published forms</Label>
          {(config.forms ?? []).map((target, index) => {
            const option = props.options.find(
              (o) => o.id === target.templateId,
            );
            return (
              <div key={index} className="space-y-2 rounded border p-3">
                <SelectField
                  id={`step-form-${index + 1}`}
                  aria-label={`Template ${index + 1}`}
                  className="h-10 w-full rounded border bg-background px-2 text-sm"
                  value={target.templateId}
                  onValueChange={(value) => {
                    const option = props.options.find(
                      (o) => o.id === value,
                    );
                    patch({
                      forms: (config.forms ?? []).map((f, i) =>
                        i === index
                          ? {
                              templateId: value,
                              roleId: option?.roles[0]?.id ?? "",
                            }
                          : f,
                      ),
                    });
                  }}
                  placeholder="Choose published form"
                >
                  <SelectFieldOption value="">Choose published form</SelectFieldOption>
                  {props.options.map((o) => (
                    <SelectFieldOption key={o.id} value={o.id}>
                      {o.name}
                    </SelectFieldOption>
                  ))}
                </SelectField>
                {option && option.kind !== "form" && (
                  <SelectField
                    id={`step-role-${index + 1}`}
                    aria-label={`Recipient role ${index + 1}`}
                    value={target.roleId}
                    className="h-10 w-full rounded border bg-background px-2 text-sm"
                    onValueChange={(value) =>
                      patch({
                        forms: (config.forms ?? []).map((f, i) =>
                          i === index ? { ...f, roleId: value } : f,
                        ),
                      })
                    }
                    placeholder="Choose PDF recipient role"
                  >
                    <SelectFieldOption value="">Choose PDF recipient role</SelectFieldOption>
                    {option?.roles.map((r) => (
                      <SelectFieldOption key={r.id} value={r.id}>
                        {r.name}
                      </SelectFieldOption>
                    ))}
                  </SelectField>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    patch({
                      forms: (config.forms ?? []).filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove form
                </Button>
              </div>
            );
          })}
          <Button
            id="step-add-form"
            type="button"
            variant="outline"
            className="w-full"
            disabled={(config.forms?.length ?? 0) >= 20}
            onClick={() =>
              patch({
                forms: [
                  ...(config.forms ?? []),
                  { templateId: "", roleId: "" },
                ],
              })
            }
          >
            Add form
          </Button>
          {!props.options.length && (
            <p className="text-sm text-muted-foreground">
              Publish a form first.{" "}
              <Link href="/forms" className="underline">
                Open form templates
              </Link>
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={config.skipExisting !== false}
              onCheckedChange={(checked) => patch({ skipExisting: (checked === true) })}
            />
            Keep forms already assigned
          </label>
          <p className="text-xs text-muted-foreground">
            Approved candidate values and published form versions are pinned
            when preparation runs.
          </p>
        </div>
      )}
      {node.kind === "send_telegram" && (
        <div className="space-y-3">
          <Label htmlFor="telegram-message">Invitation message</Label>
          <Textarea
            id="telegram-message"
            rows={6}
            maxLength={2000}
            value={config.message ?? DEFAULT_INVITATION}
            onChange={(e) => patch({ message: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            {["name", "email", "formCount"].map((token) => (
              <Button
                key={token}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  patch({
                    message:
                      (config.message ?? DEFAULT_INVITATION) + ` {${token}}`,
                  })
                }
              >{`{${token}}`}</Button>
            ))}
          </div>
          {config.message !== undefined && !config.message.trim() && (
            <p role="alert" className="text-xs text-destructive">
              Add a message before publishing. Your unfinished draft can still
              be saved.
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => patch({ message: DEFAULT_INVITATION })}
          >
            Reset message
          </Button>
          <p className="text-xs text-muted-foreground">
            Sends to the HR-confirmed Telegram contact. Account access is added
            as a private button. Sent does not mean read.
          </p>
        </div>
      )}
      {node.kind === "condition" && (
        <div className="space-y-3">
          <Label htmlFor="condition-field">Compare field</Label>
          <SelectField
            id="condition-field"
            value={config.field ?? "source"}
            className="h-10 w-full rounded border bg-background px-2 text-sm"
            onValueChange={(value) =>
              patch({ field: value as StepConfig["field"], value: "" })
            }
          >
            <SelectFieldOption value="source">Source</SelectFieldOption>
            <SelectFieldOption value="appliedPosition">Applied position</SelectFieldOption>
            <SelectFieldOption value="stageId">Application stage</SelectFieldOption>
            <SelectFieldOption value="jobId">Job opening</SelectFieldOption>
          </SelectField>
          <div className="space-y-2"><Label htmlFor="condition-operator">Comparison</Label><SelectField id="condition-operator" value={config.operator??"is"} onValueChange={v=>patch({operator:v as "is"|"is_not"})}><SelectFieldOption value="is">Is</SelectFieldOption><SelectFieldOption value="is_not">Is not</SelectFieldOption></SelectField></div>
          {!["stageId", "jobId"].includes(config.field??"")&&<div className="space-y-2"><Label htmlFor="condition-value">Value</Label>
          <Input
            id="condition-value"
            maxLength={160}
            value={config.value ?? ""}
            onChange={(e) => patch({ value: e.target.value })}
          />
          </div>}
          {["stageId", "jobId"].includes(config.field??"")&&<WorkflowStageSettings node={node} pipelineVersionId={props.pipelineVersionId} onChange={props.onChange}/>}
          <p className="text-xs text-muted-foreground">
            Compares ignoring letter case and surrounding spaces. Connect both
            Yes and No.
          </p>
        </div>
      )}
      {((node.kind==="resume_uploaded"&&isApplicationTrigger(config.trigger??""))||node.kind==="move_stage")&&<WorkflowStageSettings node={node} pipelineVersionId={props.pipelineVersionId} onChange={props.onChange}/>}
      {node.kind === "review_resume" && (
        <p className="text-sm text-muted-foreground">
          Uses the current saved CV approval; otherwise waits for HR review.
          Rejected CVs go directly to Stop.
        </p>
      )}
      {props.onMetadata && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">Name &amp; internal note</summary>
          <div className="mt-3 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="step-label">Step name</Label>
            <Input
              id="step-label"
              maxLength={80}
              placeholder={STEP_LABELS[node.kind]}
              value={node.label ?? ""}
              onChange={(e) => props.onMetadata?.({ label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="step-note">Annotation</Label>
            <Textarea
              id="step-note"
              maxLength={2000}
              placeholder="Explain this step for HR…"
              value={node.note ?? ""}
              onChange={(e) => props.onMetadata?.({ note: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Internal workflow note. Never sent to candidates.
            </p>
          </div>
          </div>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Settings update the draft immediately. Publish to use them in new runs.
      </p>
    </fieldset>
  );
}
