const RECIPIENT_FIELD_TYPES = new Set([
  "input",
  "dropdown",
  "cambodia-address",
  "checkbox",
  "radio",
  "checkbox-group",
  "radio-group",
  "date",
  "initials",
  "image-placeholder",
]);

export function isRecipientFieldType(type: string) {
  return RECIPIENT_FIELD_TYPES.has(type);
}
