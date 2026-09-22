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
