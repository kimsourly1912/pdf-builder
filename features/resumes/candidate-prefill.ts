import type { candidates } from "@/db/schema";
import {
  candidateProfilePrefillRecord,
} from "@/features/resumes/candidate-profile";
import type { CandidateProfile } from "@/features/resumes/candidate-profile";
import type { CandidatePrefillKey } from "@/features/resumes/resume.types";
import { CANDIDATE_PREFILL_KEYS } from "@/features/resumes/resume.types";
import { isRecipientFieldType } from "@/features/templates/template-fields";
import type { TemplateAnnotation } from "@/features/templates/template.types";

type CandidateRow = typeof candidates.$inferSelect;

export type CandidateProfileSnapshotSource = {
  id: string;
  profile: CandidateProfile;
  verificationStatus: "extracted" | "verified";
};

export type CandidatePrefillMetadata = {
  prefillKey: CandidatePrefillKey;
  candidateId: string;
  candidateProfileVersionId: string | null;
  confidence: number;
  sourcePage: number | null;
  source: "candidate_profile" | "candidate_record";
};

export type CandidatePrefillSnapshot = {
  values: Record<string, unknown>;
  metadata: Record<string, CandidatePrefillMetadata>;
};

export function buildCandidatePrefillSnapshot(options: {
  candidate: CandidateRow | null;
  annotations: TemplateAnnotation[];
  profileVersion?: CandidateProfileSnapshotSource | null;
}): CandidatePrefillSnapshot {
  const { candidate, annotations, profileVersion = null } = options;
  if (!candidate) return { values: {}, metadata: {} };
  const candidateValues = candidatePrefillRecord(candidate);
  const profileValues = profileVersion
    ? candidateProfilePrefillRecord(profileVersion.profile)
    : null;
  const values: Record<string, unknown> = {};
  const metadata: Record<string, CandidatePrefillMetadata> = {};

  for (const annotation of annotations) {
    if (
      !isRecipientFieldType(annotation.type)
      || !isCandidatePrefillKey(annotation.prefillKey)
      || [
        "checkbox",
        "radio",
        "checkbox-group",
        "radio-group",
        "cambodia-address",
        "image-placeholder",
      ].includes(annotation.type)
    ) {
      continue;
    }
    const profileValue = profileValues?.[annotation.prefillKey];
    const chosen = profileValue?.value
      ? {
          ...profileValue,
          source: "candidate_profile" as const,
          profileVersionId: profileVersion?.id ?? null,
          verified: profileVersion?.verificationStatus === "verified",
        }
      : {
          value: candidateValues[annotation.prefillKey],
          confidence: candidate.verificationStatus === "verified" ? 1 : 0.65,
          sourcePage: null,
          source: "candidate_record" as const,
          profileVersionId: null,
          verified: candidate.verificationStatus === "verified",
        };
    if (!chosen.value || (!chosen.verified && chosen.confidence < 0.6)) continue;
    const value = annotation.type === "dropdown"
      ? matchingDropdownOption(annotation, chosen.value)
      : chosen.value;
    if (!value) continue;
    values[annotation.id] = value;
    metadata[annotation.id] = {
      prefillKey: annotation.prefillKey,
      candidateId: candidate.id,
      candidateProfileVersionId: chosen.profileVersionId,
      confidence: chosen.confidence,
      sourcePage: chosen.sourcePage,
      source: chosen.source,
    };
  }
  return { values, metadata };
}

export function buildCandidatePrefillValues(
  candidate: CandidateRow | null,
  annotations: TemplateAnnotation[],
): Record<string, unknown> {
  return buildCandidatePrefillSnapshot({ candidate, annotations }).values;
}

export function isCandidatePrefillKey(value: unknown): value is CandidatePrefillKey {
  return CANDIDATE_PREFILL_KEYS.includes(value as CandidatePrefillKey);
}

function candidatePrefillRecord(
  candidate: CandidateRow,
): Record<CandidatePrefillKey, string> {
  const links = parsedList(candidate.linksJson);
  return {
    "candidate.full_name": candidate.fullName,
    "candidate.first_name": candidate.firstName,
    "candidate.last_name": candidate.lastName,
    "candidate.email": candidate.email,
    "candidate.primary_email": candidate.email,
    "candidate.phone": candidate.phone,
    "candidate.primary_phone": candidate.phone,
    "candidate.address": candidate.address,
    "candidate.date_of_birth": candidate.dateOfBirth ?? "",
    "candidate.gender": candidate.gender,
    "candidate.nationality": candidate.nationality,
    "candidate.current_title": candidate.currentTitle,
    "candidate.current_job_title": candidate.currentTitle,
    "candidate.current_employer": "",
    "candidate.professional_summary": candidate.professionalSummary,
    "candidate.skills": formattedList(candidate.skillsJson),
    "candidate.work_experience": formattedList(candidate.workExperienceJson),
    "candidate.education": formattedList(candidate.educationJson),
    "candidate.certifications": formattedList(candidate.certificationsJson),
    "candidate.languages": formattedList(candidate.languagesJson),
    "candidate.links": links.join("\n"),
    "candidate.linkedin_url": links.find((link) => link.toLocaleLowerCase().includes("linkedin.com")) ?? "",
    "candidate.portfolio_url": links.find((link) => !link.toLocaleLowerCase().includes("linkedin.com")) ?? "",
    "candidate.highest_degree": "",
    "candidate.highest_institution": "",
    "candidate.latest_employer": "",
    "candidate.latest_job_title": "",
    "candidate.latest_job_start_date": "",
    "candidate.latest_job_end_date": "",
  };
}

function matchingDropdownOption(
  annotation: TemplateAnnotation,
  value: string,
): string {
  if (!Array.isArray(annotation.options)) return "";
  const requested = normalizedOption(value);
  for (const option of annotation.options) {
    if (!option || typeof option !== "object" || Array.isArray(option)) continue;
    const record = option as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (label && normalizedOption(label) === requested) return label;
  }
  return "";
}

function normalizedOption(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function formattedList(value: string): string {
  return parsedList(value).join("\n");
}

function parsedList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}
