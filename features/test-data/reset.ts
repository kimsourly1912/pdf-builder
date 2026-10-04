export const RESET_OPTIONS = [
  {
    scope: "candidates",
    title: "Clear candidates",
    description:
      "Remove candidates, all CVs and intake, candidate login accounts, and their linked forms, preparation runs and invitations. Keep form templates, workflows and employee accounts.",
  },
  {
    scope: "responses",
    title: "Clear forms and preparation history",
    description:
      "Remove assignments, saved answers, submissions, correction attempts and preparation runs. Keep candidates, CV approvals, login accounts, form templates and workflows.",
  },
  {
    scope: "history",
    title: "Clear eligible automation history",
    description:
      "Remove finished or failed runs without account preparation, linked forms or invitation history. Linked history is removed by Clear candidates or Reset all.",
  },
  {
    scope: "all",
    title: "Reset all test data",
    description:
      "Remove candidates, CVs, recipient login accounts, forms and answers, preparation history, AI history and archive records. Your administrator account and integration settings stay available.",
  },
] as const;
export type ResetScope = (typeof RESET_OPTIONS)[number]["scope"];
export type ResetChoice = { scope: ResetScope; keepDefinitions: boolean };
export type ResetPreview = {
  revision: string;
  counts: { table: string; label: string; count: number }[];
  files: number;
  blockers: string[];
};
export type ResetResult = {
  removed: number;
  filesQueued: number;
  filesDeleted: number;
  filesPending: number | null;
};
export function resetChoice(body: Record<string, unknown>): ResetChoice | null {
  if (
    !RESET_OPTIONS.some((o) => o.scope === body.scope) ||
    typeof body.keepDefinitions !== "boolean"
  )
    return null;
  return {
    scope: body.scope as ResetScope,
    keepDefinitions: body.scope === "all" ? body.keepDefinitions : true,
  };
}
