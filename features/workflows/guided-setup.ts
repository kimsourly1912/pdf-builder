import { presetGraph, WORKFLOW_PRESETS, type WorkflowPreset } from "./presets";
import { graphIdentity } from "./workspace-tools";
import type { FormTarget, WorkflowGraph, TemplateOption } from "./workflow";

export function guidedGraph(
  purpose: WorkflowPreset,
  forms: FormTarget[],
): WorkflowGraph {
  const graph = presetGraph(purpose);
  const assign = graph.nodes.find((n) => n.kind === "assign_forms");
  if (assign)
    assign.config.forms = forms.map(({ templateId, roleId }) => ({
      templateId,
      roleId,
    }));
  return graph;
}
// Only the untouched preset structure can re-enter the guide. Custom canvas edits
// must never be silently rebuilt from a preset.
export function guidedPurpose(graph: WorkflowGraph): WorkflowPreset | null {
  const plain = structuredClone(graph);
  const assign = plain.nodes.find((n) => n.kind === "assign_forms");
  if (assign) assign.config.forms = [];
  return (
    (Object.keys(WORKFLOW_PRESETS).find(
      (key) =>
        graphIdentity(plain) ===
        graphIdentity(presetGraph(key as WorkflowPreset)),
    ) as WorkflowPreset | undefined) ?? null
  );
}
export function guidedFormIssues(
  purpose: WorkflowPreset,
  forms: FormTarget[],
  options: TemplateOption[],
) {
  if (purpose === "telegram") return [];
  if (!forms.length) return ["Select at least one published form."];
  if (forms.length > 20) return ["Choose up to 20 forms."];
  if (new Set(forms.map((f) => f.templateId)).size !== forms.length)
    return ["Choose each form once."];
  return forms.flatMap((f) =>
    options.some(
      (o) => o.id === f.templateId && o.roles.some((r) => r.id === f.roleId),
    )
      ? []
      : [
          "A selected form is unavailable or needs a valid form role. Refresh the forms or change the selection.",
        ],
  );
}
