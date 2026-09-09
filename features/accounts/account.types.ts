export type RecipientAccountType = "candidate" | "employee";

export type RecipientAccountSummary = {
  id: string;
  name: string;
  email: string;
  accountType: RecipientAccountType;
  mustChangePassword: boolean;
  createdAt: string;
  assignments: RecipientAssignmentSummary[];
};

export type RecipientAssignmentSummary = {
  id: string;
  templateId: string;
  templateName: string;
  versionNumber: number;
  roleId: string;
  roleName: string;
  roleColor: string;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  url?: string;
};

export function isRecipientAccountType(
  value: unknown,
): value is RecipientAccountType {
  return value === "candidate" || value === "employee";
}
