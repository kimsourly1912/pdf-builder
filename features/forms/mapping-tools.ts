import type { FormDefinition, FormField, PdfMapping } from "./form";

export function mappingProgress(definition: FormDefinition) {
  const fields = definition.fields.filter((f) => f.type !== "section");
  const excluded = fields.filter((f) => f.excludeFromPdf).length;
  const mapped = fields.filter((f) => {
    const placements = definition.mappings.filter((m) => m.fieldId === f.id);
    return (
      !f.excludeFromPdf &&
      placements.length > 0 &&
      (!f.options.length ||
        placements.some((m) => !m.optionValue) ||
        f.options.every((o) => placements.some((m) => m.optionValue === o.id)))
    );
  }).length;
  return {
    total: fields.length,
    mapped,
    excluded,
    unmapped: fields.length - mapped - excluded,
  };
}
export function sampleAnswer(field: FormField): unknown {
  if (field.options.length)
    return field.type === "checkboxes"
      ? [field.options[0].id]
      : field.options[0].id;
  switch (field.type) {
    case "email":
      return "sok.dara@example.com";
    case "date":
      return "1998-06-15";
    case "number":
      return 123;
    case "checkbox":
      return true;
    case "paragraph":
      return "123 Street 51, Phnom Penh, Cambodia. Use a realistic long answer to test this space.";
    case "photo":
    case "signature":
      return "";
    default:
      return field.label.toLowerCase().includes("name")
        ? "Sok Dara"
        : `Sample ${field.label.toLowerCase()}`;
  }
}
export function placementText(
  field: FormField,
  mapping: PdfMapping,
  value: unknown,
) {
  if (mapping.optionValue)
    return (
      Array.isArray(value)
        ? value.includes(mapping.optionValue)
        : value === mapping.optionValue
    )
      ? "✓"
      : "";
  if (field.type === "checkbox") return value ? "✓" : "";
  if (field.options.length)
    return field.options
      .filter((o) =>
        Array.isArray(value) ? value.includes(o.id) : value === o.id,
      )
      .map((o) => o.label)
      .join(", ");
  return String(value ?? "");
}
export function clampPlacement(
  mapping: PdfMapping,
  patch: Partial<PdfMapping>,
): PdfMapping {
  const result = { ...mapping, ...patch };
  result.width = Math.max(0.005, Math.min(1, result.width));
  result.height = Math.max(0.005, Math.min(1, result.height));
  result.x = Math.max(0, Math.min(1 - result.width, result.x));
  result.y = Math.max(0, Math.min(1 - result.height, result.y));
  return result;
}
// Snap edges or centers within six screen pixels. Normalized storage stays zoom-independent.
export function snapPlacement(
  mapping: PdfMapping,
  others: PdfMapping[],
  size: { width: number; height: number },
) {
  const result = { ...mapping };
  const guides: { axis: "x" | "y"; value: number }[] = [];
  for (const axis of ["x", "y"] as const) {
    const length = axis === "x" ? "width" : "height";
    let closest = 6 / size[length];
    for (const other of others.filter(
      (o) => o.id !== mapping.id && o.page === mapping.page,
    )) {
      for (const target of [
        other[axis],
        other[axis] + other[length] / 2,
        other[axis] + other[length],
      ]) {
        for (const offset of [0, mapping[length] / 2, mapping[length]]) {
          const difference = Math.abs(target - (mapping[axis] + offset));
          if (
            difference < closest &&
            target - offset >= 0 &&
            target - offset + mapping[length] <= 1
          ) {
            closest = difference;
            result[axis] = target - offset;
            guides[axis === "x" ? 0 : 1] = { axis, value: target };
          }
        }
      }
    }
  }
  return { mapping: result, guides: guides.filter(Boolean) };
}
