import { appointmentLabels } from "./appointment-presentation";
import type { InterviewProcess, InterviewRound } from "./interviews";
export function appointmentMessage(
  process: InterviewProcess,
  round: InterviewRound,
) {
  const { appointment } = round,
    labels = appointmentLabels(appointment);
  return [
    `Hello ${process.snapshot.name},`,
    "",
    `Your ${round.name} for ${process.position} is scheduled.`,
    "",
    `Date: ${labels.date}`,
    `Time: ${labels.time} (${appointment.timezone.replaceAll("_", " ")}, ${labels.offset})`,
    `Duration: ${appointment.duration} minutes`,
    `${appointment.kind === "online" ? "Meeting link" : "Location"}: ${appointment.location}`,
    `Interview contact: ${process.responsible}`,
    "",
    "Please reply to confirm that you can attend, or let us know if you need a different time.",
  ].join("\n");
}
