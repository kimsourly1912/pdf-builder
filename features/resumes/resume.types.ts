import type { CandidateProfile } from "@/features/resumes/candidate-profile";

export const RESUME_SOURCES = [
  "telegram",
  "facebook_messenger",
  "whatsapp",
  "email",
  "walk_in",
  "other",
] as const;

export type ResumeSource = (typeof RESUME_SOURCES)[number];

export const MAX_RESUME_BYTES = 15 * 1024 * 1024;
export const MAX_RESUME_PAGES = 20;
export const MAX_RESUME_UPLOAD_COUNT = 10;

export const RESUME_STATUSES = [
  "ready",
  "needs_attention",
  "possible_duplicate",
  "failed",
] as const;

export type ResumeStatus = (typeof RESUME_STATUSES)[number];

export const RESUME_EXTRACTION_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
] as const;
export type ResumeExtractionStatus =
  (typeof RESUME_EXTRACTION_STATUSES)[number];

export const RESUME_VERIFICATION_STATUSES = [
  "unverified",
  "needs_attention",
  "verified",
] as const;
export type ResumeVerificationStatus =
  (typeof RESUME_VERIFICATION_STATUSES)[number];

export type ResumeVerificationState = "extracted" | "verified";

export type ExtractedValue<T> = {
  value: T | null;
  confidence: number;
  sourcePage: number | null;
  verification: ResumeVerificationState;
  lastEditedBy: string | null;
};

export type ResumeExtractionFields = {
  fullName: ExtractedValue<string>;
  firstName: ExtractedValue<string>;
  lastName: ExtractedValue<string>;
  phones: ExtractedValue<string[]>;
  emails: ExtractedValue<string[]>;
  address: ExtractedValue<string>;
  dateOfBirth: ExtractedValue<string>;
  gender: ExtractedValue<string>;
  nationality: ExtractedValue<string>;
  currentTitle: ExtractedValue<string>;
  professionalSummary: ExtractedValue<string>;
  skills: ExtractedValue<string[]>;
  workExperience: ExtractedValue<string[]>;
  education: ExtractedValue<string[]>;
  certifications: ExtractedValue<string[]>;
  languages: ExtractedValue<string[]>;
  links: ExtractedValue<string[]>;
};

export type ResumeExtractionPayloadV1 = {
  schemaVersion: 1;
  engine: "pdf-text-heuristic-v1";
  pageCount: number;
  scannedPageCount: number;
  totalCharacters: number;
  fields: ResumeExtractionFields;
};

export type ResumeExtractionPayloadV2 = {
  schemaVersion: 2;
  engine: `hybrid:openai:${string}`;
  pageCount: number;
  scannedPageCount: number;
  totalCharacters: number;
  fields: ResumeExtractionFields;
  profile: CandidateProfile;
  providerResponseId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type ResumeExtractionPayload =
  | ResumeExtractionPayloadV1
  | ResumeExtractionPayloadV2;

export type ResumeCandidateSummary = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string | null;
  gender: string;
  nationality: string;
  currentTitle: string;
  professionalSummary: string;
  skills: string[];
  workExperience: string[];
  education: string[];
  certifications: string[];
  languages: string[];
  links: string[];
  verificationStatus: "extracted" | "verified";
};

export type ResumeSummary = {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  source: ResumeSource;
  appliedPosition: string;
  receivedDate: string;
  extractionStatus: ResumeExtractionStatus;
  verificationStatus: ResumeVerificationStatus;
  candidate: ResumeCandidateSummary | null;
  duplicateCandidate: ResumeCandidateSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type ResumeDetail = ResumeSummary & {
  cvUpdate?: {status: string; revision: string; baseResumeId: string; reason: string | null};
  intakeId?: string;
  archived?: boolean;
  candidateRevision?: string;
  telegramContact?: { username: string; confirmed: boolean };
  note: string;
  extraction: ResumeExtractionPayload | null;
  extractionVersion: number | null;
  errorMessage: string | null;
};

export const CANDIDATE_PREFILL_KEYS = [
  "candidate.full_name",
  "candidate.first_name",
  "candidate.last_name",
  "candidate.email",
  "candidate.primary_email",
  "candidate.phone",
  "candidate.primary_phone",
  "candidate.address",
  "candidate.date_of_birth",
  "candidate.gender",
  "candidate.nationality",
  "candidate.current_title",
  "candidate.current_job_title",
  "candidate.current_employer",
  "candidate.professional_summary",
  "candidate.skills",
  "candidate.work_experience",
  "candidate.education",
  "candidate.certifications",
  "candidate.languages",
  "candidate.links",
  "candidate.linkedin_url",
  "candidate.portfolio_url",
  "candidate.highest_degree",
  "candidate.highest_institution",
  "candidate.latest_employer",
  "candidate.latest_job_title",
  "candidate.latest_job_start_date",
  "candidate.latest_job_end_date",
] as const;

export type CandidatePrefillKey = (typeof CANDIDATE_PREFILL_KEYS)[number];

export function isResumeSource(value: unknown): value is ResumeSource {
  return RESUME_SOURCES.includes(value as ResumeSource);
}

export function isResumeStatus(value: unknown): value is ResumeStatus {
  return RESUME_STATUSES.includes(value as ResumeStatus);
}

export function isResumeExtractionStatus(
  value: unknown,
): value is ResumeExtractionStatus {
  return RESUME_EXTRACTION_STATUSES.includes(value as ResumeExtractionStatus);
}

export function isResumeVerificationStatus(
  value: unknown,
): value is ResumeVerificationStatus {
  return RESUME_VERIFICATION_STATUSES.includes(
    value as ResumeVerificationStatus,
  );
}
