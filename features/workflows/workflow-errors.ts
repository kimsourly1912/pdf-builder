// Only intentionally authored messages are safe to store and return to staff.
export class WorkflowStepError extends Error {}

export function workflowErrorMessage(error: unknown): string {
  return error instanceof WorkflowStepError
    ? error.message.slice(0, 500)
    : "This workflow step could not be completed. Check the candidate account, template availability, and Worker diagnostics before retrying.";
}
