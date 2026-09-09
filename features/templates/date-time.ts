type TimestampInput = string | number | Date | null | undefined;

type LocalDateTimeOptions = {
  locale?: string | string[];
  timeZone?: string;
  includeTimeZone?: boolean;
};

const UTC_WITHOUT_OFFSET =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/u;

export function parseUtcTimestamp(value: TimestampInput) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const match = UTC_WITHOUT_OFFSET.exec(text);
  const date = new Date(match ? `${match[1]}T${match[2]}Z` : text);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function toUtcIsoString(value: TimestampInput) {
  return parseUtcTimestamp(value)?.toISOString() ?? null;
}

export function formatLocalDateTime(
  value: TimestampInput,
  options: LocalDateTimeOptions = {},
) {
  const date = parseUtcTimestamp(value);
  if (!date) return typeof value === "string" && value ? value : "—";
  const { locale, timeZone, includeTimeZone = true } = options;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeTimeZone ? { timeZoneName: "short" as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function resolvedLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function normalizeTimeZone(value: unknown, fallback = "UTC") {
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    return fallback;
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return fallback;
  }
}
