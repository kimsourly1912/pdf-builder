export type StandardFieldType =
  | "input"
  | "textarea"
  | "dropdown"
  | "cambodia-address"
  | "date"
  | "initials"
  | "checkbox"
  | "radio"
  | "checkbox-group"
  | "radio-group"
  | "image-placeholder";

export type FieldDimensions = {
  width: number;
  height: number;
};

export type FieldIconVariant = "control" | "media";

const SINGLE_LINE_CONTROL = { width: 200, height: 34 } as const;
const TEXTAREA_CONTROL = { width: 200, height: 100 } as const;
const INITIALS_CONTROL = { width: 80, height: 34 } as const;
const TOGGLE_CONTROL = { width: 22, height: 22 } as const;
const OPTION_GROUP = { width: 200, height: 104 } as const;
const IMAGE_PLACEHOLDER = { width: 200, height: 100 } as const;

const STANDARD_FIELD_DIMENSIONS: Record<
  StandardFieldType,
  FieldDimensions
> = {
  input: SINGLE_LINE_CONTROL,
  textarea: TEXTAREA_CONTROL,
  dropdown: SINGLE_LINE_CONTROL,
  "cambodia-address": SINGLE_LINE_CONTROL,
  date: SINGLE_LINE_CONTROL,
  initials: INITIALS_CONTROL,
  checkbox: TOGGLE_CONTROL,
  radio: TOGGLE_CONTROL,
  "checkbox-group": OPTION_GROUP,
  "radio-group": OPTION_GROUP,
  "image-placeholder": IMAGE_PLACEHOLDER,
};

export function isStandardFieldType(type: string): type is StandardFieldType {
  return Object.hasOwn(STANDARD_FIELD_DIMENSIONS, type);
}

export function getStandardFieldDimensions(
  type: StandardFieldType,
): FieldDimensions {
  return { ...STANDARD_FIELD_DIMENSIONS[type] };
}

export function getNormalizedStandardFieldDimensions(
  type: StandardFieldType,
  page: FieldDimensions,
): FieldDimensions {
  const dimensions = getStandardFieldDimensions(type);
  return {
    width: Math.min(1, dimensions.width / Math.max(1, page.width)),
    height: Math.min(1, dimensions.height / Math.max(1, page.height)),
  };
}

export function getScaledFieldIconSize(
  scale: number,
  variant: FieldIconVariant = "control",
): number {
  const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 1;
  const baseSize = variant === "media" ? 24 : 16;
  const minimumSize = variant === "media" ? 16 : 10;
  const maximumSize = variant === "media" ? 40 : 32;
  return Math.min(maximumSize, Math.max(minimumSize, baseSize * safeScale));
}
