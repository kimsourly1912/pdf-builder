import { Badge } from "@/components/ui/badge";
import type { Appointment } from "./interviews";
export function SchedulingSummary({
  appointment,
  name,
  interviewers,
  reason,
}: {
  appointment: Appointment;
  name: string;
  interviewers: string[];
  reason?: string;
}) {
  const date = new Date(appointment.localDateTime + ":00Z");
  const dateText = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
        hour12: true,
      }).format(date)
    : "Choose date and time";
  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">Review appointment</Badge>
        <Badge variant="outline">No message sent</Badge>
      </div>
      <h3
        id="appointment-review"
        tabIndex={-1}
        className="break-words font-semibold"
      >
        {name}
      </h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {[
          ["Date & time", dateText],
          ["Timezone", appointment.timezone.replaceAll("_", " ")],
          ["Duration", `${appointment.duration} minutes`],
          [
            appointment.kind === "online" ? "Meeting link" : "Location",
            appointment.location,
          ],
          ["Interviewers", interviewers.join(", ")],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {appointment.notes && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Internal preparation notes</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">
            {appointment.notes}
          </p>
        </div>
      )}
      {reason && (
        <div className="space-y-1 text-sm">
          <p className="font-medium">Reason for rescheduling</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground">
            {reason}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Save the appointment, then use Prepare candidate message to copy the
        details into your usual communication channel.
      </p>
    </div>
  );
}
