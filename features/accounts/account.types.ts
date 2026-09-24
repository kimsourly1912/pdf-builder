export type RecipientAccountType = "candidate" | "employee";

export type RecipientAccountSummary = {
  id: string;
  name: string;
  email: string;
  accountType: RecipientAccountType;
  mustChangePassword: boolean;
  createdAt: string;
  linkedCandidate: { id: string; name: string } | null;
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
  updatedAt: string;
  prefillMode: AssignmentPrefillMode;
  approvedFieldCount: number;
  candidateProfileVersionId: string | null;
  candidateProfileVersionNumber: number | null;
  candidateName: string;
  candidateFileName: string;
  url?: string;
};

export type AssignmentTemplateSummary = {
  id: string;
  name: string;
  archivedAt: string | null;
  versionNumber: number;
  currentRoles: Array<{ id: string; name: string; color: string }>;
  filterRoles: Array<{ id: string; name: string; color: string }>;
};

export type AssignmentPrefillMode = "suggested" | "automatic" | "none";

export type AssignmentDraft = {
  templateId: string;
  roleId: string;
  candidateProfileVersionId: string | null;
  prefillMode: AssignmentPrefillMode;
  allowedFieldIds: string[];
  allowedProfileKeys: string[];
  profileMismatchConfirmed?: boolean;
  requestKey?: string;
};

export type CandidateProfileOption = {
  id: string;
  candidateId: string;
  candidateName: string;
  email: string;
  phone: string;
  currentTitle: string;
  versionNumber: number;
  verificationStatus: "extracted" | "verified";
  fileName: string;
  appliedPosition: string;
  receivedDate: string | null;
  createdAt: string;
  linkedToAccount: boolean;
};

export type AssignmentAutofillField = {
  fieldId: string;
  fieldLabel: string;
  prefillKey: import("@/features/resumes/resume.types").CandidatePrefillKey;
  value: string;
  confidence: number | null;
  sourcePage: number | null;
  verificationStatus: "extracted" | "verified" | null;
  status: "filled" | "empty" | "needs_review";
};

export type AssignmentAutofillPreview = {
  profile: CandidateProfileOption;
  profileFields: Array<{
    key: import("@/features/resumes/resume.types").CandidatePrefillKey;
    label: string;
    value: string;
    confidence: number;
    sourcePage: number | null;
    status: "filled" | "needs_review";
  }>;
  summary: {
    totalFields: number;
    mappedFields: number;
    filledFields: number;
    emptyFields: number;
    needsReviewFields: number;
    unmappedFields: number;
  };
  fields: AssignmentAutofillField[];
};

export function isRecipientAccountType(
  value: unknown,
): value is RecipientAccountType {
  return value === "candidate" || value === "employee";
}
