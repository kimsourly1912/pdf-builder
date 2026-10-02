export const DEFAULT_ELEMENT_TEXT_COLOR = "#475569";
export const DEFAULT_ELEMENT_BORDER_COLOR = "#64748b";
export const DEFAULT_ELEMENT_FONT_SIZE = 10;
export const DEFAULT_HIGHLIGHT_COLOR = "#facc15";

export function getDefaultElementColor(type: string) {
  return type === "highlight"
    ? DEFAULT_HIGHLIGHT_COLOR
    : DEFAULT_ELEMENT_TEXT_COLOR;
}
