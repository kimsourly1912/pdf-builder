import "server-only";
import { fail } from "@/features/workflows/workflow.server";
import {
  CRITERIA,
  RECOMMENDATIONS,
  type Appointment,
  type Scorecard,
} from "./interviews";
export function identifier(value: unknown, label = "record") {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    fail(`Choose a valid ${label}.`, 422);
  return value as string;
}
export function boundedText(
  value: unknown,
  label: string,
  min = 0,
  max = 2000,
) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    fail(`Enter ${label} (${min}–${max} characters).`, 422);
  return (value as string).trim();
}
export function reason(value: unknown) {
  return boundedText(value, "a meaningful reason", 10, 2000);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Enter valid interview data.", 422);
  return value as Record<string, unknown>;
}
export function timezone(value: unknown) {
  const zone = boundedText(value, "an IANA timezone", 3, 80);
  if (!zone.includes("/") && zone !== "UTC")
    fail("Choose an explicit IANA timezone, such as Asia/Phnom_Penh.", 422);
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  } catch {
    fail("Choose a valid IANA timezone.", 422);
  }
  return zone;
}
function localParts(time: number, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(time)
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
// Resolve wall time with Intl, rejecting nonexistent and ambiguous DST times.
export function localToUtc(local: unknown, zone: string) {
  if (typeof local !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local))
    fail("Enter a date and time including minutes.", 422);
  const input = local as string,
    naive = Date.parse(input + ":00Z");
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 16) !== input ||
    input.slice(0, 4) < "2020" ||
    input.slice(0, 4) > "2100"
  )
    fail("Enter a real date between 2020 and 2100.", 422);
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = naive + delta;
    offsets.add(Date.parse(localParts(sample, zone) + ":00Z") - sample);
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((time) => localParts(time, zone) === input);
  if (matches.length !== 1)
    fail(
      "This local time is ambiguous or does not exist in that timezone. Choose another time or use UTC.",
      422,
    );
  return new Date(matches[0]).toISOString();
}
export function parseAppointment(value: unknown): Appointment {
  const a = object(value),
    zone = timezone(a.timezone),
    startsAt = localToUtc(a.localDateTime, zone);
  if (
    !Number.isInteger(a.duration) ||
    Number(a.duration) < 5 ||
    Number(a.duration) > 480
  )
    fail("Choose a duration from 5 to 480 minutes.", 422);
  if (a.kind !== "in_person" && a.kind !== "online")
    fail("Choose in-person or online.", 422);
  const location = boundedText(
    a.location,
    "a location or HTTPS meeting link",
    3,
    1000,
  );
  if (a.kind === "online") {
    try {
      const url = new URL(location);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !url.hostname.includes(".")
      )
        throw new Error();
    } catch {
      fail("Use an HTTPS meeting link without embedded credentials.", 422);
    }
  }
  return {
    startsAt,
    localDateTime: String(a.localDateTime),
    timezone: zone,
    duration: Number(a.duration),
    kind: a.kind,
    location,
    notes: boundedText(a.notes ?? "", "preparation notes"),
  };
}
export function parseInterviewers(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    fail("Name 1–10 required interviewers.", 422);
  const names = (value as unknown[]).map((n) =>
    boundedText(n, "an interviewer name", 2, 120),
  );
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
    fail("Each required interviewer must have a distinct name.", 422);
  return names;
}
export function parseScorecard(value: unknown): Scorecard {
  const s = object(value);
  if (
    !Array.isArray(s.ratings) ||
    s.ratings.length !== CRITERIA.length ||
    s.ratings.some(
      (r) =>
        r !== null && (!Number.isInteger(r) || Number(r) < 1 || Number(r) > 5),
    )
  )
    fail("Use ratings 1–5 or Not assessed for each criterion.", 422);
  if (
    typeof s.recommendation !== "string" ||
    !Object.hasOwn(RECOMMENDATIONS, s.recommendation)
  )
    fail("Choose a recommendation.", 422);
  return {
    ratings: s.ratings as (number | null)[],
    notes: boundedText(s.notes, "feedback notes"),
    strengths: boundedText(s.strengths, "strengths"),
    concerns: boundedText(s.concerns, "concerns"),
    recommendation: s.recommendation as Scorecard["recommendation"],
  };
}
