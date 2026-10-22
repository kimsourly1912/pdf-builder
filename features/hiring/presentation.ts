import type { HiringApplication } from "./hiring";

export function applicationStatusLabel(
  app: Pick<HiringApplication, "outcome" | "hold">,
) {
  if (app.outcome === "hired") return "Hired";
  if (app.outcome === "rejected") return "Not selected";
  if (app.outcome === "withdrawn") return "Withdrawn";
  return app.hold ? "On hold" : "Active";
}

export function stageAgeLabel(value: string | null, now = Date.now()) {
  const started = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(started)) return "Stage start unknown";
  const days = Math.max(0, Math.floor((now - started) / 86400000));
  return days === 0
    ? "Today in stage"
    : `${days} ${days === 1 ? "day" : "days"} in stage`;
}

export function applicationAppointmentLabel(
  value: string,
  timezone?: string | null,
) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Interview time unavailable";
  let zone = timezone || "UTC";
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  return `${date.toLocaleString(undefined, {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} (${zone})`;
}
