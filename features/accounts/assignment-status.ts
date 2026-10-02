export type AssignmentDisplayState =
  | "active"
  | "completed"
  | "cancelled"
  | "expired";

export type AssignmentDisplay = {
  state: AssignmentDisplayState;
  label: string;
  detail: string;
};

export function assignmentDisplay(status: string): AssignmentDisplay {
  if (status === "active" || status === "assigned") {
    return {
      state: "active",
      label: "Pending",
      detail: "Waiting for submission",
    };
  }
  if (status === "completed") {
    return {
      state: "completed",
      label: "Submitted",
      detail: "Submission completed",
    };
  }
  if (status === "cancelled" || status === "revoked") {
    return {
      state: "cancelled",
      label: "Cancelled",
      detail: "Cancelled by HR",
    };
  }
  return {
    state: "expired",
    label: "Expired",
    detail: "This assignment is no longer available",
  };
}
