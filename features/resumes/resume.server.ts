import "server-only";

import type { candidates } from "@/db/schema";
import { normalizeCandidateProfile } from "@/features/resumes/candidate-profile";
import type {
  ExtractedValue,
  ResumeCandidateSummary,
  ResumeExtractionFields,
  ResumeExtractionPayload,
  ResumeStatus,
} from "@/features/resumes/resume.types";
import { MAX_RESUME_PAGES, isResumeSource } from "@/features/resumes/resume.types";
import { normalizeEmail, normalizePhone } from "@/features/resumes/resume-extraction";

type CandidateRow = typeof candidates.$inferSelect;

export function safeResumeFileName(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f/\\]/gu, "_")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "resume"}.pdf`;
}

export function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function parseResumeExtraction(value: unknown): ResumeExtractionPayload | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const extraction = value as Record<string, unknown>;
  const pageCount = extraction.pageCount;
  if (
    !integerInRange(pageCount, 1, MAX_RESUME_PAGES) ||
    !integerInRange(extraction.scannedPageCount, 0, pageCount) ||
    !integerInRange(extraction.totalCharacters, 0, 500_000) ||
    !validFields(extraction.fields)
  ) {
    return null;
  }
  if (
    extraction.schemaVersion === 1 &&
    extraction.engine === "pdf-text-heuristic-v1"
  ) {
    return extraction as ResumeExtractionPayload;
  }
  if (
    extraction.schemaVersion === 2 &&
    typeof extraction.engine === "string" &&
    extraction.engine.startsWith("hybrid:openai:")
  ) {
    const profile = normalizeCandidateProfile(extraction.profile, pageCount);
    if (!profile) return null;
    return { ...extraction, profile } as ResumeExtractionPayload;
  }
  return null;
}

export function resumeStatusForExtraction(
  extraction: ResumeExtractionPayload | null,
  hasDuplicate: boolean,
  extractionFailed: boolean,
): ResumeStatus {
  if (extractionFailed) return "failed";
  if (hasDuplicate) return "possible_duplicate";
  if (!extraction || extraction.totalCharacters < 20) return "needs_attention";
  const fields = extraction.fields;
  if (!fields.fullName.value && !fields.emails.value?.[0] && !fields.phones.value?.[0]) {
    return "needs_attention";
  }
  return "ready";
}

export function candidateInsertFromExtraction(
  extraction: ResumeExtractionPayload,
  options: { id: string; ownerEmail: string; now: string },
) {
  const fields = extraction.fields;
  const email = fields.emails.value?.[0] ?? "";
  const phone = fields.phones.value?.[0] ?? "";
  return {
    id: options.id,
    ownerEmail: options.ownerEmail,
    fullName: fields.fullName.value ?? "",
    firstName: fields.firstName.value ?? "",
    lastName: fields.lastName.value ?? "",
    email,
    normalizedEmail: email ? normalizeEmail(email) : "",
    phone,
    normalizedPhone: phone ? normalizePhone(phone) : "",
    address: fields.address.value ?? "",
    dateOfBirth: normalizedDateOnly(fields.dateOfBirth.value),
    gender: fields.gender.value ?? "",
    nationality: fields.nationality.value ?? "",
    currentTitle: fields.currentTitle.value ?? "",
    professionalSummary: fields.professionalSummary.value ?? "",
    skillsJson: JSON.stringify(fields.skills.value ?? []),
    workExperienceJson: JSON.stringify(fields.workExperience.value ?? []),
    educationJson: JSON.stringify(fields.education.value ?? []),
    certificationsJson: JSON.stringify(fields.certifications.value ?? []),
    languagesJson: JSON.stringify(fields.languages.value ?? []),
    linksJson: JSON.stringify(fields.links.value ?? []),
    verificationStatus: "extracted" as const,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

export function emptyCandidateInsert(options: { id: string; ownerEmail: string; now: string }) {
  return {
    id: options.id,
    ownerEmail: options.ownerEmail,
    fullName: "",
    firstName: "",
    lastName: "",
    email: "",
    normalizedEmail: "",
    phone: "",
    normalizedPhone: "",
    address: "",
    dateOfBirth: null,
    gender: "",
    nationality: "",
    currentTitle: "",
    professionalSummary: "",
    skillsJson: "[]",
    workExperienceJson: "[]",
    educationJson: "[]",
    certificationsJson: "[]",
    languagesJson: "[]",
    linksJson: "[]",
    verificationStatus: "extracted" as const,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

export function candidateSummary(row: CandidateRow | null): ResumeCandidateSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    nationality: row.nationality,
    currentTitle: row.currentTitle,
    professionalSummary: row.professionalSummary,
    skills: parseStringArray(row.skillsJson),
    workExperience: parseStringArray(row.workExperienceJson),
    education: parseStringArray(row.educationJson),
    certifications: parseStringArray(row.certificationsJson),
    languages: parseStringArray(row.languagesJson),
    links: parseStringArray(row.linksJson),
    verificationStatus: row.verificationStatus === "verified" ? "verified" : "extracted",
  };
}

export function safeResumeInput(formData: FormData) {
  const source = String(formData.get("source") ?? "");
  const appliedPosition = boundedText(formData.get("appliedPosition"), 120);
  const receivedDate = String(formData.get("receivedDate") ?? "");
  const note = boundedText(formData.get("note"), 2_000);
  if (!isResumeSource(source)) return { ok: false as const, message: "Choose a valid resume source." };
  if (!validDateOnly(receivedDate)) return { ok: false as const, message: "Choose a valid received date." };
  if (appliedPosition === null || note === null) return { ok: false as const, message: "Resume details are too long." };
  return { ok: true as const, source, appliedPosition, receivedDate, note };
}

export function updateExtractionWithVerifiedCandidate(
  extraction: ResumeExtractionPayload,
  candidate: ResumeCandidateSummary,
  editorEmail: string,
): ResumeExtractionPayload {
  const fields = structuredClone(extraction.fields);
  const nameParts = candidate.fullName.trim().split(/\s+/u).filter(Boolean);
  fields.fullName = verified(candidate.fullName, fields.fullName, editorEmail);
  fields.firstName = verified(nameParts[0] ?? "", fields.firstName, editorEmail);
  fields.lastName = verified(nameParts.slice(1).join(" "), fields.lastName, editorEmail);
  fields.emails = verified(candidate.email ? [candidate.email] : [], fields.emails, editorEmail);
  fields.phones = verified(candidate.phone ? [candidate.phone] : [], fields.phones, editorEmail);
  fields.address = verified(candidate.address, fields.address, editorEmail);
  fields.dateOfBirth = verified(candidate.dateOfBirth ?? "", fields.dateOfBirth, editorEmail);
  fields.gender = verified(candidate.gender, fields.gender, editorEmail);
  fields.nationality = verified(candidate.nationality, fields.nationality, editorEmail);
  fields.currentTitle = verified(candidate.currentTitle, fields.currentTitle, editorEmail);
  fields.professionalSummary = verified(candidate.professionalSummary, fields.professionalSummary, editorEmail);
  fields.skills = verified(candidate.skills, fields.skills, editorEmail);
  fields.workExperience = verified(candidate.workExperience, fields.workExperience, editorEmail);
  fields.education = verified(candidate.education, fields.education, editorEmail);
  fields.certifications = verified(candidate.certifications, fields.certifications, editorEmail);
  fields.languages = verified(candidate.languages, fields.languages, editorEmail);
  fields.links = verified(candidate.links, fields.links, editorEmail);
  return { ...extraction, fields };
}

export function parseCandidateUpdate(value: unknown): Omit<ResumeCandidateSummary, "id" | "verificationStatus"> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fullName = boundedString(record.fullName, 120);
  const email = boundedString(record.email, 254);
  const phone = boundedString(record.phone, 40);
  const address = boundedString(record.address, 500);
  const dateOfBirthValue = boundedString(record.dateOfBirth, 10);
  const dateOfBirth = dateOfBirthValue || null;
  const gender = boundedString(record.gender, 80);
  const nationality = boundedString(record.nationality, 120);
  const currentTitle = boundedString(record.currentTitle, 160);
  const professionalSummary = boundedString(record.professionalSummary, 2_000);
  if ([fullName, email, phone, address, gender, nationality, currentTitle, professionalSummary].some((item) => item === null)) return null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return null;
  if (dateOfBirth && !validDateOnly(dateOfBirth)) return null;
  const skills = stringArray(record.skills);
  const workExperience = stringArray(record.workExperience);
  const education = stringArray(record.education);
  const certifications = stringArray(record.certifications);
  const languages = stringArray(record.languages);
  const links = stringArray(record.links);
  if ([skills, workExperience, education, certifications, languages, links].some((item) => item === null)) return null;
  return {
    fullName: fullName!, email: email!, phone: phone!, address: address!, dateOfBirth,
    gender: gender!, nationality: nationality!, currentTitle: currentTitle!,
    professionalSummary: professionalSummary!, skills: skills!, workExperience: workExperience!,
    education: education!, certifications: certifications!, languages: languages!, links: links!,
  };
}

function validFields(value: unknown): value is ResumeExtractionFields {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const fields = value as Record<string, unknown>;
  const scalarKeys = ["fullName", "firstName", "lastName", "address", "dateOfBirth", "gender", "nationality", "currentTitle", "professionalSummary"];
  const listKeys = ["phones", "emails", "skills", "workExperience", "education", "certifications", "languages", "links"];
  return scalarKeys.every((key) => validExtractedValue(fields[key], false)) && listKeys.every((key) => validExtractedValue(fields[key], true));
}

function validExtractedValue(value: unknown, list: boolean): boolean {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const field = value as Record<string, unknown>;
  const validValue = field.value === null || (list
    ? Array.isArray(field.value) && field.value.length <= 100 && field.value.every((item) => typeof item === "string" && item.length <= 2_000)
    : typeof field.value === "string" && field.value.length <= 5_000);
  return validValue && typeof field.confidence === "number" && field.confidence >= 0 && field.confidence <= 1 && (field.sourcePage === null || integerInRange(field.sourcePage, 1, MAX_RESUME_PAGES)) && (field.verification === "extracted" || field.verification === "verified") && (field.lastEditedBy === null || typeof field.lastEditedBy === "string");
}

function verified<T>(value: T, previous: ExtractedValue<T>, editorEmail: string): ExtractedValue<T> {
  return { ...previous, value, confidence: 1, verification: "verified", lastEditedBy: editorEmail };
}

function boundedText(value: FormDataEntryValue | null, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const result = value.map((item) => typeof item === "string" ? item.trim() : null);
  return result.every((item) => item !== null && item.length <= 2_000) ? result.filter(Boolean) as string[] : null;
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function normalizedDateOnly(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b(\d{4}-\d{2}-\d{2})\b/u);
  if (match && validDateOnly(match[1])) return match[1];
  const numeric = value.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b/u);
  if (!numeric) return null;
  const date = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  return validDateOnly(date) ? date : null;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
