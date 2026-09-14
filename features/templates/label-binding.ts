import type { TemplateAnnotation } from "@/features/templates/template.types";

export type LabelBinding = {
  text: string;
  sourceText: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  source: "pdf-text" | "pdf-form" | "manual" | "ai-detection";
};

export type SubmissionAnswer = {
  fieldId: string;
  key: string;
  label: string;
  type: string;
  value: unknown;
};

export function createFieldKey(value: string, fallback = "field") {
  const key = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 64);
  return key || fallback;
}

export function annotationFieldKey(annotation: TemplateAnnotation) {
  if (typeof annotation.fieldKey === "string" && annotation.fieldKey.trim()) {
    return createFieldKey(annotation.fieldKey);
  }
  const label = annotationLabel(annotation);
  return createFieldKey(label, `field_${annotation.id.replace(/[^a-zA-Z0-9]/gu, "").slice(-12)}`);
}

export function annotationLabel(annotation: TemplateAnnotation) {
  const binding = annotation.labelBinding;
  if (isLabelBinding(binding) && binding.text.trim()) return binding.text.trim();
  if (typeof annotation.fieldName === "string" && annotation.fieldName.trim()) return annotation.fieldName.trim();
  if (typeof annotation.label === "string" && annotation.label.trim()) return annotation.label.trim();
  return annotation.type;
}

export function buildSubmissionAnswers(
  annotations: TemplateAnnotation[],
  values: Record<string, unknown>,
) {
  return [...annotations]
    .sort((left, right) => {
      const tabDifference = numberValue(left.tabIndex, Number.MAX_SAFE_INTEGER) - numberValue(right.tabIndex, Number.MAX_SAFE_INTEGER);
      if (tabDifference) return tabDifference;
      if (left.page !== right.page) return left.page - right.page;
      if (left.y !== right.y) return left.y - right.y;
      return left.x - right.x;
    })
    .map<SubmissionAnswer>((annotation) => ({
      fieldId: annotation.id,
      key: annotationFieldKey(annotation),
      label: annotationLabel(annotation),
      type: annotation.type,
      value: values[annotation.id],
    }));
}

export function duplicateFieldKeys(annotations: TemplateAnnotation[]) {
  const counts = new Map<string, number>();
  for (const annotation of annotations) {
    const key = annotationFieldKey(annotation);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

export function createUniqueFieldKey(
  value: string,
  annotations: TemplateAnnotation[],
) {
  const baseKey = createFieldKey(value);
  const usedKeys = new Set(annotations.map(annotationFieldKey));
  if (!usedKeys.has(baseKey)) return baseKey;

  for (let copyNumber = 2; copyNumber <= annotations.length + 2; copyNumber += 1) {
    const suffix = `_${copyNumber}`;
    const candidate = `${baseKey.slice(0, 64 - suffix.length)}${suffix}`;
    if (!usedKeys.has(candidate)) return candidate;
  }

  return createFieldKey(`field_${crypto.randomUUID()}`);
}

export function isSubmissionAnswer(value: unknown): value is SubmissionAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answer = value as Partial<SubmissionAnswer>;
  return typeof answer.fieldId === "string" && typeof answer.key === "string" && typeof answer.label === "string" && typeof answer.type === "string";
}

export function isLabelBinding(value: unknown): value is LabelBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Partial<LabelBinding>;
  return typeof binding.text === "string" && typeof binding.page === "number" && (binding.source === "pdf-text" || binding.source === "pdf-form" || binding.source === "manual" || binding.source === "ai-detection");
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
