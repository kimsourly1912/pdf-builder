export type SubmissionFilters = {
  templateId: string;
  roleId: string;
  search: string;
  from: string;
  to: string;
};

export type SubmissionFilterResult =
  | { filters: SubmissionFilters; error: null }
  | { filters: null; error: string };

export function parseSubmissionFilters(
  searchParams: URLSearchParams,
): SubmissionFilterResult {
  const templateId = clean(searchParams.get("templateId"), 120);
  const roleId = clean(searchParams.get("roleId"), 120);
  const search = clean(searchParams.get("search"), 120);
  const from = normalizeDate(searchParams.get("from"));
  const to = normalizeDate(searchParams.get("to"));

  if (searchParams.get("from") && !from) {
    return { filters: null, error: "The start date is invalid." };
  }
  if (searchParams.get("to") && !to) {
    return { filters: null, error: "The end date is invalid." };
  }
  if (from && to && from >= to) {
    return { filters: null, error: "The end date must be after the start date." };
  }
  return {
    filters: { templateId, roleId, search, from, to },
    error: null,
  };
}

export function localDateRangeToUtc(fromDate: string, toDate: string) {
  return {
    from: localDateBoundary(fromDate, false),
    to: localDateBoundary(toDate, true),
  };
}

function clean(value: string | null, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function normalizeDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function localDateBoundary(value: string, nextDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  if (nextDay) parsed.setDate(parsed.getDate() + 1);
  return parsed.toISOString();
}
