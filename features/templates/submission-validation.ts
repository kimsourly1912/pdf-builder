import {
  GAZETTEER_LEVELS,
  isAddressComplete,
  isGazetteerLevel,
  parseCambodiaAddress,
  truncateCambodiaAddress,
} from "@/features/gazetteer/gazetteer";
import type {
  GazetteerLevel,
  GazetteerLocation,
} from "@/features/gazetteer/gazetteer.types";
import {
  annotationLabel,
  duplicateFieldKeys,
} from "@/features/templates/label-binding";
import { isRecipientFieldType } from "@/features/templates/template-fields";
import type {
  RecipientRole,
  TemplateAnnotation,
  TemplatePageEntry,
} from "@/features/templates/template.types";

const TEMPLATE_ANNOTATION_TYPES = new Set([
  "text",
  "highlight",
  "drawing",
  "rectangle",
  "input",
  "dropdown",
  "cambodia-address",
  "checkbox",
  "radio",
  "checkbox-group",
  "radio-group",
  "signature",
  "date",
  "initials",
  "ellipse",
  "line",
  "image",
  "image-placeholder",
]);
const MAX_ANNOTATIONS = 1_000;
const MAX_FIELD_TEXT = 10_000;
const MAX_IMAGE_FIELDS = 20;

export type SubmissionValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; message: string };

export function validateTemplateDefinition(options: {
  annotations: TemplateAnnotation[];
  pageOrder: TemplatePageEntry[];
  roles: RecipientRole[];
  sourcePageCount: number;
}): string | null {
  const { annotations, pageOrder, roles, sourcePageCount } = options;
  if (pageOrder.length < 1 || pageOrder.length > 500) {
    return "The template must contain between 1 and 500 pages.";
  }
  const pageIds = new Set<string>();
  for (const page of pageOrder) {
    if (
      !page ||
      !validOpaqueId(page.id) ||
      pageIds.has(page.id) ||
      !Number.isInteger(page.sourcePage) ||
      page.sourcePage < 1 ||
      page.sourcePage > sourcePageCount ||
      ![0, 90, 180, 270].includes(page.rotation)
    ) {
      return "The template page order is invalid.";
    }
    pageIds.add(page.id);
  }
  if (annotations.length > MAX_ANNOTATIONS) {
    return `Templates support at most ${MAX_ANNOTATIONS} annotations.`;
  }
  const roleIds = new Set(roles.map((role) => role.id));
  const annotationIds = new Set<string>();
  let imageFieldCount = 0;
  for (const annotation of annotations) {
    if (
      !annotation ||
      !validOpaqueId(annotation.id) ||
      annotationIds.has(annotation.id) ||
      !TEMPLATE_ANNOTATION_TYPES.has(annotation.type) ||
      !Number.isInteger(annotation.page) ||
      annotation.page < 1 ||
      annotation.page > pageOrder.length ||
      !validNormalizedRect(annotation) ||
      !/^#[0-9a-f]{6}$/iu.test(annotation.color)
    ) {
      return "The template contains an invalid annotation.";
    }
    annotationIds.add(annotation.id);
    if (annotation.type === "image-placeholder") imageFieldCount += 1;
    if (
      isRecipientFieldType(annotation.type) &&
      (typeof annotation.recipientRoleId !== "string" ||
        !roleIds.has(annotation.recipientRoleId))
    ) {
      return `Assign ${annotationLabel(annotation)} to a valid recipient.`;
    }
    if (hasOptions(annotation.type) && !validOptions(annotation.options)) {
      return `${annotationLabel(annotation)} has invalid options.`;
    }
    if (
      annotation.type === "cambodia-address" &&
      annotation.gazetteerLevel !== undefined &&
      !isGazetteerLevel(annotation.gazetteerLevel)
    ) {
      return `${annotationLabel(annotation)} has an invalid address level.`;
    }
  }
  if (imageFieldCount > MAX_IMAGE_FIELDS) {
    return `Templates support at most ${MAX_IMAGE_FIELDS} recipient image fields.`;
  }
  const duplicateKeys = duplicateFieldKeys(
    annotations.filter((annotation) => isRecipientFieldType(annotation.type)),
  );
  if (duplicateKeys.size > 0) {
    return `Recipient field keys must be unique: ${[...duplicateKeys].join(", ")}.`;
  }
  return null;
}

export function validateSubmissionValues(options: {
  fields: TemplateAnnotation[];
  values: Record<string, unknown>;
  imageFieldIds: Set<string>;
}): SubmissionValidationResult {
  const { fields, values, imageFieldIds } = options;
  const allowedIds = new Set(fields.map((field) => field.id));
  if (Object.keys(values).some((id) => !allowedIds.has(id))) {
    return { ok: false, message: "The submission contains unknown fields." };
  }
  if ([...imageFieldIds].some((id) => !allowedIds.has(id))) {
    return { ok: false, message: "The submission contains an unexpected image." };
  }

  const normalized: Record<string, unknown> = {};
  for (const field of fields) {
    const label = annotationLabel(field);
    const result = validateFieldValue(
      field,
      values[field.id],
      imageFieldIds.has(field.id),
    );
    if (!result.ok) return { ok: false, message: `${label}: ${result.message}` };
    normalized[field.id] = result.value;
  }
  return { ok: true, values: normalized };
}

function validateFieldValue(
  field: TemplateAnnotation,
  value: unknown,
  hasImage: boolean,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (field.type === "image-placeholder") {
    if (value !== undefined && value !== null && value !== "") {
      return { ok: false, message: "send the image using the upload field." };
    }
    if (Boolean(field.required) && !hasImage) {
      return { ok: false, message: "an image is required." };
    }
    return { ok: true, value: null };
  }
  if (field.type === "checkbox" || field.type === "radio") {
    if (typeof value !== "boolean") {
      return { ok: false, message: "must be true or false." };
    }
    if (Boolean(field.required) && !value) {
      return { ok: false, message: "must be selected." };
    }
    return { ok: true, value };
  }
  if (field.type === "checkbox-group" || field.type === "radio-group") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      return { ok: false, message: "has an invalid selection." };
    }
    const selected = value as string[];
    const allowed = new Set(getOptionIds(field.options));
    if (new Set(selected).size !== selected.length || selected.some((id) => !allowed.has(id))) {
      return { ok: false, message: "has an invalid selection." };
    }
    if (field.type === "radio-group" && selected.length > 1) {
      return { ok: false, message: "allows only one selection." };
    }
    if (Boolean(field.required) && selected.length === 0) {
      return { ok: false, message: "requires a selection." };
    }
    return { ok: true, value: selected };
  }
  if (field.type === "dropdown") {
    if (typeof value !== "string") {
      return { ok: false, message: "has an invalid selection." };
    }
    if (value && !getOptionIds(field.options).includes(value)) {
      return { ok: false, message: "has an invalid selection." };
    }
    if (Boolean(field.required) && !value) {
      return { ok: false, message: "requires a selection." };
    }
    return { ok: true, value };
  }
  if (field.type === "cambodia-address") {
    return validateAddress(field, value);
  }
  if (field.type === "date") {
    if (typeof value !== "string") return { ok: false, message: "must be a date." };
    const date = value.trim();
    if (Boolean(field.required) && !date) return { ok: false, message: "is required." };
    if (date && !validDate(date)) return { ok: false, message: "must use YYYY-MM-DD." };
    return { ok: true, value: date };
  }
  if (field.type === "input" || field.type === "initials") {
    if (typeof value !== "string") return { ok: false, message: "must be text." };
    const text = value.trim();
    const maxLength = validMaxLength(field.maxLength);
    if (Boolean(field.required) && !text) return { ok: false, message: "is required." };
    if (text.length > maxLength) {
      return { ok: false, message: `must be ${maxLength} characters or fewer.` };
    }
    const validation = typeof field.validation === "string" ? field.validation : "none";
    if (text && validation === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)) {
      return { ok: false, message: "must be a valid email address." };
    }
    if (text && validation === "number" && !Number.isFinite(Number(text))) {
      return { ok: false, message: "must be a number." };
    }
    if (text && validation === "phone" && !/^[+()\d\s.-]{6,}$/u.test(text)) {
      return { ok: false, message: "must be a valid phone number." };
    }
    if (!["none", "email", "number", "phone"].includes(validation)) {
      return { ok: false, message: "has an unsupported validation rule." };
    }
    return { ok: true, value: text };
  }
  return { ok: false, message: "uses an unsupported field type." };
}

function validateAddress(
  field: TemplateAnnotation,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    if (Boolean(field.required)) return { ok: false, message: "is required." };
    return { ok: true, value: parseCambodiaAddress(null) };
  }
  const deepestLevel: GazetteerLevel = isGazetteerLevel(field.gazetteerLevel)
    ? field.gazetteerLevel
    : "village";
  const parsedAddress = parseCambodiaAddress(value);
  const address = truncateCambodiaAddress(parsedAddress, deepestLevel);
  const rawAddress = value as Record<string, unknown>;
  for (const level of GAZETTEER_LEVELS) {
    if (rawAddress[level] !== undefined && rawAddress[level] !== null && !parsedAddress[level]) {
      return { ok: false, message: "has invalid location data." };
    }
  }
  const deepestIndex = GAZETTEER_LEVELS.indexOf(deepestLevel);
  if (
    GAZETTEER_LEVELS.slice(deepestIndex + 1).some(
      (level) => rawAddress[level] !== undefined && rawAddress[level] !== null,
    )
  ) {
    return { ok: false, message: "contains a location below the configured level." };
  }
  const expectedLengths: Record<GazetteerLevel, number> = {
    province: 2,
    district: 4,
    commune: 6,
    village: 8,
  };
  let parent: GazetteerLocation | null = null;
  for (const level of GAZETTEER_LEVELS) {
    const location = address[level];
    if (!location) {
      if (GAZETTEER_LEVELS.slice(GAZETTEER_LEVELS.indexOf(level) + 1).some((next) => address[next])) {
        return { ok: false, message: "has an incomplete hierarchy." };
      }
      break;
    }
    if (
      !new RegExp(`^\\d{${expectedLengths[level]}}$`, "u").test(location.code) ||
      !boundedText(location.nameKm, 160) ||
      !boundedText(location.nameEn, 160) ||
      !boundedText(location.type, 80) ||
      (parent &&
        (location.parentCode !== parent.code ||
          !location.code.startsWith(parent.code)))
    ) {
      return { ok: false, message: "has invalid location data." };
    }
    parent = location;
  }
  if (Boolean(field.required) && !isAddressComplete(address, deepestLevel)) {
    return { ok: false, message: "is incomplete." };
  }
  return { ok: true, value: address };
}

function validNormalizedRect(annotation: TemplateAnnotation): boolean {
  return (
    [annotation.x, annotation.y, annotation.width, annotation.height].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    annotation.x >= 0 &&
    annotation.y >= 0 &&
    annotation.width > 0 &&
    annotation.height > 0 &&
    annotation.x + annotation.width <= 1.001 &&
    annotation.y + annotation.height <= 1.001
  );
}

function validOptions(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every((option) => {
    if (!option || Array.isArray(option) || typeof option !== "object") return false;
    const candidate = option as Record<string, unknown>;
    if (
      !validOpaqueId(candidate.id) ||
      ids.has(candidate.id) ||
      typeof candidate.label !== "string" ||
      !boundedText(candidate.label, 200) ||
      (candidate.checked !== undefined && typeof candidate.checked !== "boolean")
    ) {
      return false;
    }
    ids.add(candidate.id);
    return true;
  });
}

function validOpaqueId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/u.test(value);
}

function getOptionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (!option || Array.isArray(option) || typeof option !== "object") return [];
    const id = (option as Record<string, unknown>).id;
    return typeof id === "string" ? [id] : [];
  });
}

function hasOptions(type: string): boolean {
  return type === "dropdown" || type === "checkbox-group" || type === "radio-group";
}

function validMaxLength(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_FIELD_TEXT)
    : MAX_FIELD_TEXT;
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function boundedText(value: string, maxLength: number): boolean {
  return value.trim().length > 0 && value.length <= maxLength;
}
