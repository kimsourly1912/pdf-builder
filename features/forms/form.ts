import { z } from "zod";
import { isCandidatePrefillKey } from "@/features/resumes/candidate-prefill";
import type { TemplateAnnotation } from "@/features/templates/template.types";

// Only the storage adapter uses this identity; new forms expose no recipient roles.
export const FORM_ASSIGNMENT_ROLE = {
  id: "form_user",
  name: "Assigned user",
  color: "#2563eb",
};
export const FIELD_TYPES = [
  "short_text",
  "paragraph",
  "email",
  "number",
  "date",
  "dropdown",
  "radio",
  "checkboxes",
  "checkbox",
  "photo",
  "signature",
  "section",
] as const;
export const FIELD_LABELS: Record<(typeof FIELD_TYPES)[number], string> = {
  short_text: "Short text",
  paragraph: "Paragraph",
  email: "Email",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  radio: "Single choice",
  checkboxes: "Multiple choice",
  checkbox: "Checkbox",
  photo: "Photo",
  signature: "Signature",
  section: "Section",
};
const identifier = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,120}$/u)
  .refine((id) => !["__proto__", "constructor", "prototype"].includes(id));
export const fieldSchema = z
  .object({
    id: identifier,
    type: z.enum(FIELD_TYPES),
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/u)
      .refine(
        (key) => !["constructor", "prototype", "__proto__"].includes(key),
      ),
    label: z.string().trim().min(1).max(160),
    help: z.string().max(500).default(""),
    required: z.boolean().default(false),
    width: z.enum(["full", "half"]).default("full"),
    options: z
      .array(
        z.object({ id: identifier, label: z.string().trim().min(1).max(160) }),
      )
      .max(50)
      .default([]),
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    autofill: z.string().refine(isCandidatePrefillKey).optional(),
    editable: z.boolean().default(true),
    excludeFromPdf: z.boolean().optional(),
  })
  .strict();
export const mappingSchema = z
  .object({
    id: identifier,
    fieldId: identifier,
    page: z.number().int().min(1).max(100),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.005).max(1),
    height: z.number().min(0.005).max(1),
    fontSize: z.number().min(6).max(48).default(12),
    alignment: z.enum(["left", "center", "right"]).default("left"),
    optionValue: z.string().max(120).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu)
      .optional(),
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/iu)
      .optional(),
    textMode: z.enum(["single", "wrap"]).optional(),
    lineSpacing: z.number().min(1).max(3).optional(),
    minFontSize: z.number().min(6).max(48).optional(),
    imageFit: z.enum(["contain", "stretch"]).optional(),
  })
  .strict()
  .refine(
    (m) => m.x + m.width <= 1.001 && m.y + m.height <= 1.001,
    "Keep the placement inside the page.",
  )
  .refine(
    (m) => (m.minFontSize ?? 6) <= m.fontSize,
    "Minimum text size must not exceed the starting size.",
  );
export const definitionSchema = z
  .object({
    format: z.literal(1),
    presentation: z
      .object({
        title: z.string().min(1).max(160),
        description: z.string().max(500),
      })
      .strict()
      .optional(),
    fields: z.array(fieldSchema).max(200),
    mappings: z.array(mappingSchema).max(500),
    pageCount: z.number().int().min(0).max(100),
  })
  .strict()
  .superRefine((form, context) => {
    const ids = new Set<string>(),
      keys = new Set<string>();
    for (const [index, field] of form.fields.entries()) {
      if (
        ids.has(field.id) ||
        (field.type !== "section" && keys.has(field.key))
      )
        context.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: "Each field needs a unique identity and JSON key.",
        });
      if (
        field.excludeFromPdf &&
        form.mappings.some((m) => m.fieldId === field.id)
      )
        context.addIssue({
          code: "custom",
          path: ["fields", index, "excludeFromPdf"],
          message: "Remove placements before excluding this field from PDF.",
        });
      ids.add(field.id);
      if (field.type !== "section") keys.add(field.key);
      if (
        ["dropdown", "radio", "checkboxes"].includes(field.type) &&
        (!field.options.length ||
          new Set(field.options.map((o) => o.id)).size !== field.options.length)
      )
        context.addIssue({
          code: "custom",
          path: ["fields", index, "options"],
          message: "Add choices with unique values.",
        });
      if (
        (field.minLength ?? 0) > (field.maxLength ?? 10000) ||
        (field.min ?? -Infinity) > (field.max ?? Infinity)
      )
        context.addIssue({
          code: "custom",
          path: ["fields", index],
          message: "Minimum must not exceed maximum.",
        });
    }
    const mappingIds = new Set<string>();
    for (const [index, mapping] of form.mappings.entries()) {
      const field = form.fields.find(
        (f) => f.id === mapping.fieldId && f.type !== "section",
      );
      if (
        !field ||
        mapping.page > form.pageCount ||
        mappingIds.has(mapping.id) ||
        (mapping.optionValue !== undefined &&
          !field.options.some((o) => o.id === mapping.optionValue))
      )
        context.addIssue({
          code: "custom",
          path: ["mappings", index],
          message:
            "PDF placement refers to an unavailable field, choice, or page.",
        });
      mappingIds.add(mapping.id);
    }
  });
export type FormField = z.infer<typeof fieldSchema>;
export type PdfMapping = z.infer<typeof mappingSchema>;
export type FormDefinition = z.infer<typeof definitionSchema>;
export const EMPTY_FORM: FormDefinition = {
  format: 1,
  fields: [],
  mappings: [],
  pageCount: 0,
};
export function answerSchema(definition: FormDefinition, draft = false) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of definition.fields.filter((f) => f.type !== "section")) {
    let value: z.ZodType;
    if (field.type === "number") {
      let number = z.number().finite("Enter a valid number.");
      if (field.min !== undefined) number = number.min(field.min);
      if (field.max !== undefined) number = number.max(field.max);
      value = z.preprocess(
        (input) =>
          typeof input === "string" && input.trim() !== ""
            ? Number(input)
            : input,
        field.required && !draft ? number : z.union([z.literal(""), number]),
      );
    } else if (field.type === "checkbox") {
      value =
        field.required && !draft
          ? z.literal(true, { error: "This checkbox is required." })
          : z.boolean();
    } else if (field.type === "checkboxes") {
      let list = z
        .array(
          z
            .string()
            .refine(
              (id) => field.options.some((o) => o.id === id),
              "Choose an available option.",
            ),
        )
        .refine((items) => new Set(items).size === items.length);
      if (field.required && !draft)
        list = list.min(1, "Choose at least one option.");
      value = list;
    } else {
      let text = z
        .string()
        .max(field.maxLength ?? 10000, "This answer is too long.");
      if (field.required && !draft)
        text = text.trim().min(1, "This field is required.");
      if (field.minLength && !draft)
        text = text.refine(
          (s) => !s || s.length >= field.minLength!,
          `Enter at least ${field.minLength} characters.`,
        );
      if (field.type === "email" && !draft)
        text = text.refine(
          (s) => !s || z.email().safeParse(s).success,
          "Enter a valid email.",
        );
      if (field.type === "date" && !draft)
        text = text.refine(
          (s) =>
            !s ||
            (/^\d{4}-\d{2}-\d{2}$/u.test(s) &&
              !Number.isNaN(Date.parse(s)) &&
              new Date(s).toISOString().slice(0, 10) === s),
          "Enter a valid date.",
        );
      if (["dropdown", "radio"].includes(field.type))
        text = text.refine(
          (s) => !s || field.options.some((o) => o.id === s),
          "Choose an available option.",
        );
      value = text;
    }
    shape[field.id] = value;
  }
  return z.object(shape).strict();
}
export function initialAnswers(
  definition: FormDefinition,
  values: Record<string, unknown> = {},
) {
  return Object.fromEntries(
    definition.fields
      .filter((f) => f.type !== "section")
      .map((f) => [
        f.id,
        values[f.id] ??
          (f.type === "checkbox" ? false : f.type === "checkboxes" ? [] : ""),
      ]),
  );
}
export function formAnnotations(
  definition: FormDefinition,
): TemplateAnnotation[] {
  return definition.fields
    .filter((f) => f.type !== "section")
    .map((f, i) => ({
      id: f.id,
      fieldKey: f.key,
      fieldName: f.label,
      label: f.label,
      type: (
        {
          short_text: "input",
          paragraph: "textarea",
          email: "input",
          number: "input",
          date: "date",
          dropdown: "dropdown",
          radio: "dropdown",
          checkboxes: "checkbox-group",
          checkbox: "checkbox",
          photo: "image-placeholder",
          signature: "image-placeholder",
        } as Record<string, string>
      )[f.type],
      page: 1,
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.05,
      color: "#000000",
      tabIndex: i,
      options: f.options,
      required: f.required,
      prefillKey: f.autofill as TemplateAnnotation["prefillKey"],
      recipientRoleId: FORM_ASSIGNMENT_ROLE.id,
    }));
}
export function formAnswers(
  definition: FormDefinition,
  values: Record<string, unknown>,
) {
  return definition.fields
    .filter((f) => f.type !== "section")
    .map((f) => ({
      fieldId: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      value: values[f.id],
      ...(["dropdown", "radio", "checkboxes"].includes(f.type)
        ? {
            displayValue: f.options
              .filter((o) =>
                Array.isArray(values[f.id])
                  ? (values[f.id] as unknown[]).includes(o.id)
                  : values[f.id] === o.id,
              )
              .map((o) => o.label)
              .join(", "),
          }
        : {}),
    }));
}
export function outputPlacements(
  definition: FormDefinition,
  values: Record<string, unknown>,
) {
  const fields = formAnnotations(definition);
  const outputValues = { ...values };
  const annotations = definition.mappings.map((mapping) => {
    const field = fields.find((f) => f.id === mapping.fieldId)!;
    const id = mapping.id;
    outputValues[id] =
      mapping.optionValue !== undefined
        ? Array.isArray(values[field.id])
          ? (values[field.id] as unknown[]).includes(mapping.optionValue)
          : values[field.id] === mapping.optionValue
        : values[field.id];
    return {
      ...field,
      ...mapping,
      id,
      type: mapping.optionValue !== undefined ? "checkbox" : field.type,
      textAlign: mapping.alignment,
      formOutput: true,
    };
  });
  return { annotations, values: outputValues };
}
