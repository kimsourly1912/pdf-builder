export type RecipientRole = {
  id: string;
  name: string;
  color: string;
};

export type TemplatePageEntry = {
  id: string;
  sourcePage: number;
  rotation: 0 | 90 | 180 | 270;
};

export type TemplateAnnotation = {
  id: string;
  page: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  recipientRoleId?: string;
  fieldKey?: string;
  prefillKey?: import("@/features/resumes/resume.types").CandidatePrefillKey;
  labelBinding?: import("@/features/templates/label-binding").LabelBinding;
  [key: string]: unknown;
};

export type RecipientResumePrefill = {
  values: Record<string, unknown>;
  profileValues: Record<string, { value: string; confidence: number | null; sourcePage: number | null }>;
  metadata: Record<string, {
    prefillKey: import("@/features/resumes/resume.types").CandidatePrefillKey;
    confidence: number | null;
    sourcePage: number | null;
    verificationStatus: "extracted" | "verified";
  }>;
};

export type TemplateFillPayload = {
  template: {
    id: string;
    versionId: string;
    versionNumber: number;
    name: string;
    description: string;
    fileName: string;
    annotations: TemplateAnnotation[];
    pageOrder: TemplatePageEntry[];
  };
  recipient: RecipientRole;
  link: {
    expiresAt: string | null;
    maxSubmissions: number;
    submissionCount: number;
  };
  identity?: {
    name: string;
    email: string;
    accountType: "candidate" | "employee";
  };
  initialValues?: Record<string, unknown>;
  resumePrefill?: RecipientResumePrefill;
};
