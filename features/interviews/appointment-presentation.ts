import type { Appointment } from "./interviews";

export function hour12(hour24: string) {
  return hour24 === "" ? "" : String(Number(hour24) % 12 || 12);
}
export function hour24(hour: string, period: "AM" | "PM") {
  return String((Number(hour) % 12) + (period === "PM" ? 12 : 0)).padStart(
    2,
    "0",
  );
}
export function appointmentLabels(appointment: Appointment) {
  const date = new Date(appointment.startsAt);
  const options = { timeZone: appointment.timezone };
  return {
    date: new Intl.DateTimeFormat("en-GB", {
      ...options,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("en-US", {
      ...options,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date),
    offset:
      new Intl.DateTimeFormat("en", { ...options, timeZoneName: "shortOffset" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")?.value ?? "",
  };
}
