import { isCandidatePrefillEligibleAnnotation } from "@/features/resumes/candidate-prefill";
import type { TemplateAnnotation } from "@/features/templates/template.types";

export function resumeValueForField(
  annotation: TemplateAnnotation,
  value: string,
  recipientRoleId: string,
): string | null {
  if (!isCandidatePrefillEligibleAnnotation(annotation, recipientRoleId)) return null;
  if (annotation.type === "textarea") return value;
  if (annotation.type === "input") return /[\r\n]/u.test(value) ? null : value;
  if (annotation.type === "date") {
    return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
  }
  if (annotation.type !== "dropdown" || !Array.isArray(annotation.options)) return null;
  const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const match = annotation.options.find((option) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) return false;
    const record = option as Record<string, unknown>;
    return typeof record.label === "string" && normalize(record.label) === normalize(value);
  }) as Record<string, unknown> | undefined;
  return typeof match?.id === "string" ? match.id : null;
}

export function hasRecipientValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return String(value ?? "").trim().length > 0;
}

export function applyResumeSuggestions(options: {
  currentValues: Record<string, unknown>;
  suggestions: Record<string, unknown>;
  fieldIds?: string[];
  protectedFieldIds?: Iterable<string>;
  overwrite?: boolean;
}): Record<string, unknown> {
  const allowed = options.fieldIds
    ? new Set(options.fieldIds)
    : new Set(Object.keys(options.suggestions));
  const protectedFields = new Set(options.protectedFieldIds ?? []);
  const next = { ...options.currentValues };

  for (const [fieldId, value] of Object.entries(options.suggestions)) {
    if (!allowed.has(fieldId) || !hasRecipientValue(value)) continue;
    if (!options.overwrite && protectedFields.has(fieldId)) continue;
    next[fieldId] = value;
  }
  return next;
}
