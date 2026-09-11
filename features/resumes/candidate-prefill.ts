import type { candidates } from "@/db/schema";
import type { CandidatePrefillKey } from "@/features/resumes/resume.types";
import { CANDIDATE_PREFILL_KEYS } from "@/features/resumes/resume.types";
import type { TemplateAnnotation } from "@/features/templates/template.types";
import { isRecipientFieldType } from "@/features/templates/template-fields";

type CandidateRow = typeof candidates.$inferSelect;

export function buildCandidatePrefillValues(
  candidate: CandidateRow | null,
  annotations: TemplateAnnotation[],
): Record<string, unknown> {
  if (!candidate) return {};
  const values = candidatePrefillRecord(candidate);
  return Object.fromEntries(
    annotations.flatMap((annotation) => {
      if (!isRecipientFieldType(annotation.type) || !isCandidatePrefillKey(annotation.prefillKey)) return [];
      if (["checkbox", "radio", "checkbox-group", "radio-group", "dropdown", "cambodia-address", "image-placeholder"].includes(annotation.type)) return [];
      const value = values[annotation.prefillKey];
      return value ? [[annotation.id, value] as const] : [];
    }),
  );
}

export function isCandidatePrefillKey(value: unknown): value is CandidatePrefillKey {
  return CANDIDATE_PREFILL_KEYS.includes(value as CandidatePrefillKey);
}

function candidatePrefillRecord(candidate: CandidateRow): Record<CandidatePrefillKey, string> {
  return {
    "candidate.full_name": candidate.fullName,
    "candidate.first_name": candidate.firstName,
    "candidate.last_name": candidate.lastName,
    "candidate.email": candidate.email,
    "candidate.phone": candidate.phone,
    "candidate.address": candidate.address,
    "candidate.date_of_birth": candidate.dateOfBirth ?? "",
    "candidate.gender": candidate.gender,
    "candidate.nationality": candidate.nationality,
    "candidate.current_title": candidate.currentTitle,
    "candidate.professional_summary": candidate.professionalSummary,
    "candidate.skills": formattedList(candidate.skillsJson),
    "candidate.work_experience": formattedList(candidate.workExperienceJson),
    "candidate.education": formattedList(candidate.educationJson),
    "candidate.certifications": formattedList(candidate.certificationsJson),
    "candidate.languages": formattedList(candidate.languagesJson),
    "candidate.links": formattedList(candidate.linksJson),
  };
}

function formattedList(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").join("\n") : "";
  } catch {
    return "";
  }
}
