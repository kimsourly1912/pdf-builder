export type TemplateRemovalDisposition = "archive" | "delete";

export function templateRemovalDisposition(options: {
  assignmentCount: number;
  submissionCount: number;
}): TemplateRemovalDisposition {
  const { assignmentCount, submissionCount } = options;
  return assignmentCount > 0 || submissionCount > 0 ? "archive" : "delete";
}
