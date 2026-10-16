import type { HiringApplication, HiringStage, Requirement } from "./hiring";
export type ApplicationTab =
  | "overview"
  | "documents"
  | "interviews"
  | "offer"
  | "activity";
export type ApplicationTask = {
  label: string;
  description: string;
  tab: ApplicationTab;
  action?: "assign_job" | "move" | "resume" | "reopen";
  attention: boolean;
};
export function applicationTask(
  app: HiringApplication,
  stage: HiringStage | undefined,
  facts: Record<Requirement, boolean>,
  failed = false,
): ApplicationTask {
  const task = (
    label: string,
    description: string,
    tab: ApplicationTab,
    attention = true,
    action?: ApplicationTask["action"],
  ): ApplicationTask => ({ label, description, tab, attention, action });
  if (app.outcome)
    return task(
      "View outcome",
      "This application is closed. Reopen explicitly to continue hiring.",
      "offer",
      false,
    );
  if (app.hold)
    return task("Resume application", app.hold, "overview", false, "resume");
  if (failed)
    return task(
      "Resolve automation issue",
      "Review the failed execution before retrying its affected step.",
      "activity",
    );
  if (!app.jobId)
    return task(
      "Assign job",
      "Choose the job and its published hiring model.",
      "overview",
      true,
      "assign_job",
    );
  if (!facts.cv_approved)
    return task(
      "Review CV",
      "Review and explicitly approve the selected application CV.",
      "documents",
    );
  const missing = [
    ...new Set([...(stage?.entry ?? []), ...(stage?.exit ?? [])]),
  ].filter((r) => !facts[r]);
  const required = missing[0];
  if (required === "preparation_ready")
    return task(
      "Prepare account & forms",
      "Review preparation, account reuse and the required documents for this application.",
      "documents",
    );
  if (required === "forms_submitted")
    return task(
      "View required forms",
      "Waiting for every required submission. Check access and delivery if needed.",
      "documents",
      false,
    );
  if (required === "forms_accepted")
    return task(
      "Review documents",
      "Review each required submission and accept it or request corrections.",
      "documents",
    );
  if (
    stage?.activity === "interview" &&
    app.nextAppointment &&
    Date.parse(app.nextAppointment) <= Date.now()
  )
    return task(
      "Record interview attendance",
      "The scheduled time has passed. Record whether the interview took place, then complete its feedback.",
      "interviews",
    );
  if (stage?.activity === "interview" && app.nextAppointment)
    return task(
      "View scheduled interview",
      "Review the appointment, then record attendance and required feedback after the interview.",
      "interviews",
      false,
    );
  if (stage?.activity === "interview" && facts.interview_complete)
    return task(
      "Review next stage",
      "The interview completion requirement is satisfied. Choose the appropriate next stage.",
      "overview",
      false,
      "move",
    );
  if (required === "interview_complete" || stage?.activity === "interview")
    return task(
      app.interviewId ? "Open interview tasks" : "Start interviews",
      "Schedule rounds, record attendance and complete the required feedback for this stage.",
      "interviews",
    );
  if (stage?.activity === "forms" && !facts.forms_accepted)
    return task(
      facts.forms_submitted
        ? "Review documents"
        : facts.preparation_ready
          ? "View required forms"
          : "Prepare account & forms",
      "Manage this application's required forms and document review.",
      "documents",
      !facts.preparation_ready || facts.forms_submitted,
    );
  if (stage?.activity === "offer")
    return task(
      app.offer === "accepted"
        ? "Record hiring decision"
        : "Record offer progress",
      "Record offer status and the explicit hiring outcome separately.",
      "offer",
    );
  return task(
    "Review next stage",
    "The current stage has no outstanding configured requirements. Choose the appropriate next stage.",
    "overview",
    false,
    "move",
  );
}
