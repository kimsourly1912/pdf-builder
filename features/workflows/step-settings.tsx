"use client";
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
import { DATA_HELP, DEFAULT_INVITATION } from "./editor-tools";
export function StepSettings(props: {
  node: WorkflowNode;
  options: TemplateOption[];
  disabled?: boolean;
  onChange: (config: StepConfig) => void;
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
          <select
            id="workflow-trigger"
            value={config.trigger ?? "staff_upload"}
            className="h-10 w-full rounded border bg-background px-2 text-sm"
            onChange={(e) =>
              patch({ trigger: e.target.value as StepConfig["trigger"] })
            }
          >
            {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
                <select
                  aria-label={`Template ${index + 1}`}
                  className="h-10 w-full rounded border bg-background px-2 text-sm"
                  value={target.templateId}
                  onChange={(e) => {
                    const option = props.options.find(
                      (o) => o.id === e.target.value,
                    );
                    patch({
                      forms: (config.forms ?? []).map((f, i) =>
                        i === index
                          ? {
                              templateId: e.target.value,
                              roleId: option?.roles[0]?.id ?? "",
                            }
                          : f,
                      ),
                    });
                  }}
                >
                  <option value="">Choose published form</option>
                  {props.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                {option?.kind !== "form" && (
                  <select
                    aria-label={`Recipient role ${index + 1}`}
                    value={target.roleId}
                    className="h-10 w-full rounded border bg-background px-2 text-sm"
                    onChange={(e) =>
                      patch({
                        forms: (config.forms ?? []).map((f, i) =>
                          i === index ? { ...f, roleId: e.target.value } : f,
                        ),
                      })
                    }
                  >
                    <option value="">Choose PDF recipient role</option>
                    {option?.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
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
            Add template
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
            <input
              type="checkbox"
              checked={config.skipExisting !== false}
              onChange={(e) => patch({ skipExisting: e.target.checked })}
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
          <div className="flex flex-wrap gap-1">
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
              Enter a message to save this draft.
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
          <Label htmlFor="condition-field">Compare CV field</Label>
          <select
            id="condition-field"
            value={config.field ?? "source"}
            className="h-10 w-full rounded border bg-background px-2 text-sm"
            onChange={(e) =>
              patch({ field: e.target.value as "source" | "appliedPosition" })
            }
          >
            <option value="source">Source</option>
            <option value="appliedPosition">Applied position</option>
          </select>
          <Label htmlFor="condition-value">Equals</Label>
          <Input
            id="condition-value"
            maxLength={160}
            value={config.value ?? ""}
            onChange={(e) => patch({ value: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Compares ignoring letter case and surrounding spaces. Connect both
            Yes and No.
          </p>
        </div>
      )}
      <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Input & output
        </summary>
        <div className="mt-3 space-y-3 text-xs">
          <p>
            <strong>Input:</strong> {DATA_HELP[node.kind].input}
          </p>
          <p>
            <strong>Output:</strong> {DATA_HELP[node.kind].output}
          </p>
        </div>
      </details>
      {node.kind === "review_resume" && (
        <p className="text-sm text-muted-foreground">
          Pauses for HR approval. Configure account details during CV review.
          Rejected CVs must go directly to Stop.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Settings update the draft immediately. Publish to use them in new runs.
      </p>
    </fieldset>
  );
}
