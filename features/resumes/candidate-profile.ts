import type {
  ExtractedValue,
  ResumeCandidateSummary,
  ResumeExtractionFields,
} from "@/features/resumes/resume.types";

export type ProfileValue<T> = {
  value: T | null;
  confidence: number;
  sourcePage: number | null;
};

export type WorkExperienceEntry = {
  employer: string;
  jobTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type EducationEntry = {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: string;
  endDate: string;
  description: string;
};

export type CertificationEntry = {
  name: string;
  issuer: string;
  issuedDate: string;
  expiryDate: string;
};

export type LanguageEntry = {
  name: string;
  proficiency: string;
};

export type CandidateProfile = {
  schemaVersion: 2;
  identity: {
    fullName: ProfileValue<string>;
    firstName: ProfileValue<string>;
    lastName: ProfileValue<string>;
    dateOfBirth: ProfileValue<string>;
    gender: ProfileValue<string>;
    nationality: ProfileValue<string>;
  };
  contact: {
    primaryEmail: ProfileValue<string>;
    emails: ProfileValue<string[]>;
    primaryPhone: ProfileValue<string>;
    phones: ProfileValue<string[]>;
    address: ProfileValue<string>;
    linkedinUrl: ProfileValue<string>;
    portfolioUrl: ProfileValue<string>;
    links: ProfileValue<string[]>;
  };
  professional: {
    currentTitle: ProfileValue<string>;
    currentEmployer: ProfileValue<string>;
    summary: ProfileValue<string>;
    skills: ProfileValue<string[]>;
  };
  workExperience: ProfileValue<WorkExperienceEntry[]>;
  education: ProfileValue<EducationEntry[]>;
  certifications: ProfileValue<CertificationEntry[]>;
  languages: ProfileValue<LanguageEntry[]>;
};

export type CandidateProfilePrefillValue = {
  value: string;
  confidence: number;
  sourcePage: number | null;
};

export function normalizeCandidateProfile(
  value: unknown,
  pageCount: number,
): CandidateProfile | null {
  const root = objectValue(value);
  const identity = objectValue(root?.identity);
  const contact = objectValue(root?.contact);
  const professional = objectValue(root?.professional);
  if (!root || root.schemaVersion !== 2 || !identity || !contact || !professional) {
    return null;
  }

  const profile: CandidateProfile = {
    schemaVersion: 2,
    identity: {
      fullName: scalar(identity.fullName, pageCount, 160),
      firstName: scalar(identity.firstName, pageCount, 100),
      lastName: scalar(identity.lastName, pageCount, 100),
      dateOfBirth: scalar(identity.dateOfBirth, pageCount, 40),
      gender: scalar(identity.gender, pageCount, 80),
      nationality: scalar(identity.nationality, pageCount, 120),
    },
    contact: {
      primaryEmail: scalar(contact.primaryEmail, pageCount, 254),
      emails: stringList(contact.emails, pageCount, 20, 254),
      primaryPhone: scalar(contact.primaryPhone, pageCount, 40),
      phones: stringList(contact.phones, pageCount, 20, 40),
      address: scalar(contact.address, pageCount, 500),
      linkedinUrl: scalar(contact.linkedinUrl, pageCount, 500),
      portfolioUrl: scalar(contact.portfolioUrl, pageCount, 500),
      links: stringList(contact.links, pageCount, 30, 500),
    },
    professional: {
      currentTitle: scalar(professional.currentTitle, pageCount, 160),
      currentEmployer: scalar(professional.currentEmployer, pageCount, 160),
      summary: scalar(professional.summary, pageCount, 2_000),
      skills: stringList(professional.skills, pageCount, 100, 160),
    },
    workExperience: objectList(
      root.workExperience,
      pageCount,
      50,
      normalizeWorkExperience,
    ),
    education: objectList(root.education, pageCount, 50, normalizeEducation),
    certifications: objectList(
      root.certifications,
      pageCount,
      50,
      normalizeCertification,
    ),
    languages: objectList(root.languages, pageCount, 50, normalizeLanguage),
  };
  return profile;
}

export function mergeDeterministicResumeValues(
  profile: CandidateProfile,
  fallback: ResumeExtractionFields,
): CandidateProfile {
  const merged = structuredClone(profile);
  merged.contact.emails = mergeStringList(merged.contact.emails, fallback.emails);
  merged.contact.phones = mergeStringList(merged.contact.phones, fallback.phones);
  merged.contact.links = mergeStringList(merged.contact.links, fallback.links);
  if (!merged.contact.primaryEmail.value && merged.contact.emails.value?.[0]) {
    merged.contact.primaryEmail = {
      value: merged.contact.emails.value[0],
      confidence: merged.contact.emails.confidence,
      sourcePage: merged.contact.emails.sourcePage,
    };
  }
  if (!merged.contact.primaryPhone.value && merged.contact.phones.value?.[0]) {
    merged.contact.primaryPhone = {
      value: merged.contact.phones.value[0],
      confidence: merged.contact.phones.confidence,
      sourcePage: merged.contact.phones.sourcePage,
    };
  }
  return merged;
}

export function profileToResumeFields(
  profile: CandidateProfile,
  fallback?: ResumeExtractionFields,
): ResumeExtractionFields {
  return {
    fullName: legacy(profile.identity.fullName, fallback?.fullName),
    firstName: legacy(profile.identity.firstName, fallback?.firstName),
    lastName: legacy(profile.identity.lastName, fallback?.lastName),
    phones: legacy(profile.contact.phones, fallback?.phones),
    emails: legacy(profile.contact.emails, fallback?.emails),
    address: legacy(profile.contact.address, fallback?.address),
    dateOfBirth: legacy(profile.identity.dateOfBirth, fallback?.dateOfBirth),
    gender: legacy(profile.identity.gender, fallback?.gender),
    nationality: legacy(profile.identity.nationality, fallback?.nationality),
    currentTitle: legacy(profile.professional.currentTitle, fallback?.currentTitle),
    professionalSummary: legacy(profile.professional.summary, fallback?.professionalSummary),
    skills: legacy(profile.professional.skills, fallback?.skills),
    workExperience: legacy(
      mapped(profile.workExperience, formatWorkExperience),
      fallback?.workExperience,
    ),
    education: legacy(mapped(profile.education, formatEducation), fallback?.education),
    certifications: legacy(
      mapped(profile.certifications, formatCertification),
      fallback?.certifications,
    ),
    languages: legacy(mapped(profile.languages, formatLanguage), fallback?.languages),
    links: legacy(profile.contact.links, fallback?.links),
  };
}

export function candidateProfileFromSummary(
  candidate: ResumeCandidateSummary,
): CandidateProfile {
  const fullName = candidate.fullName.trim();
  const parts = fullName.split(/\s+/u).filter(Boolean);
  return {
    schemaVersion: 2,
    identity: {
      fullName: verified(fullName),
      firstName: verified(parts[0] ?? ""),
      lastName: verified(parts.slice(1).join(" ")),
      dateOfBirth: verified(candidate.dateOfBirth ?? ""),
      gender: verified(candidate.gender),
      nationality: verified(candidate.nationality),
    },
    contact: {
      primaryEmail: verified(candidate.email),
      emails: verified(candidate.email ? [candidate.email] : []),
      primaryPhone: verified(candidate.phone),
      phones: verified(candidate.phone ? [candidate.phone] : []),
      address: verified(candidate.address),
      linkedinUrl: verified(findLink(candidate.links, "linkedin.com")),
      portfolioUrl: verified(findPortfolio(candidate.links)),
      links: verified(candidate.links),
    },
    professional: {
      currentTitle: verified(candidate.currentTitle),
      currentEmployer: verified(""),
      summary: verified(candidate.professionalSummary),
      skills: verified(candidate.skills),
    },
    workExperience: verified(
      candidate.workExperience.map((description) => ({
        employer: "",
        jobTitle: "",
        location: "",
        startDate: "",
        endDate: "",
        description,
      })),
    ),
    education: verified(
      candidate.education.map((description) => ({
        institution: "",
        degree: "",
        fieldOfStudy: "",
        startDate: "",
        endDate: "",
        description,
      })),
    ),
    certifications: verified(
      candidate.certifications.map((name) => ({
        name,
        issuer: "",
        issuedDate: "",
        expiryDate: "",
      })),
    ),
    languages: verified(
      candidate.languages.map((name) => ({ name, proficiency: "" })),
    ),
  };
}

export function candidateProfilePrefillRecord(
  profile: CandidateProfile,
): Record<string, CandidateProfilePrefillValue> {
  const firstJob = profile.workExperience.value?.[0];
  const firstEducation = profile.education.value?.[0];
  return {
    "candidate.full_name": prefill(profile.identity.fullName),
    "candidate.first_name": prefill(profile.identity.firstName),
    "candidate.last_name": prefill(profile.identity.lastName),
    "candidate.email": prefill(profile.contact.primaryEmail),
    "candidate.primary_email": prefill(profile.contact.primaryEmail),
    "candidate.phone": prefill(profile.contact.primaryPhone),
    "candidate.primary_phone": prefill(profile.contact.primaryPhone),
    "candidate.address": prefill(profile.contact.address),
    "candidate.date_of_birth": prefill(profile.identity.dateOfBirth),
    "candidate.gender": prefill(profile.identity.gender),
    "candidate.nationality": prefill(profile.identity.nationality),
    "candidate.current_title": prefill(profile.professional.currentTitle),
    "candidate.current_job_title": prefill(profile.professional.currentTitle),
    "candidate.current_employer": prefill(profile.professional.currentEmployer),
    "candidate.professional_summary": prefill(profile.professional.summary),
    "candidate.skills": prefill(mapped(profile.professional.skills, (value) => value)),
    "candidate.work_experience": prefill(mapped(profile.workExperience, formatWorkExperience)),
    "candidate.education": prefill(mapped(profile.education, formatEducation)),
    "candidate.certifications": prefill(mapped(profile.certifications, formatCertification)),
    "candidate.languages": prefill(mapped(profile.languages, formatLanguage)),
    "candidate.links": prefill(mapped(profile.contact.links, (value) => value)),
    "candidate.linkedin_url": prefill(profile.contact.linkedinUrl),
    "candidate.portfolio_url": prefill(profile.contact.portfolioUrl),
    "candidate.highest_degree": sectionPrefill(firstEducation?.degree ?? "", profile.education),
    "candidate.highest_institution": sectionPrefill(firstEducation?.institution ?? "", profile.education),
    "candidate.latest_employer": sectionPrefill(firstJob?.employer ?? "", profile.workExperience),
    "candidate.latest_job_title": sectionPrefill(firstJob?.jobTitle ?? "", profile.workExperience),
    "candidate.latest_job_start_date": sectionPrefill(firstJob?.startDate ?? "", profile.workExperience),
    "candidate.latest_job_end_date": sectionPrefill(firstJob?.endDate ?? "", profile.workExperience),
  };
}

function scalar(value: unknown, pageCount: number, maximumLength: number): ProfileValue<string> {
  const field = objectValue(value);
  return {
    value:
      field?.value === null
        ? null
        : typeof field?.value === "string"
          ? field.value.trim().slice(0, maximumLength) || null
          : null,
    confidence: confidence(field?.confidence),
    sourcePage: sourcePage(field?.sourcePage, pageCount),
  };
}

function stringList(
  value: unknown,
  pageCount: number,
  maximumItems: number,
  maximumLength: number,
): ProfileValue<string[]> {
  const field = objectValue(value);
  const items = Array.isArray(field?.value)
    ? uniqueStrings(field.value, maximumItems, maximumLength)
    : [];
  return {
    value: items.length > 0 ? items : null,
    confidence: confidence(field?.confidence),
    sourcePage: sourcePage(field?.sourcePage, pageCount),
  };
}

function objectList<T>(
  value: unknown,
  pageCount: number,
  maximumItems: number,
  normalize: (value: unknown) => T | null,
): ProfileValue<T[]> {
  const field = objectValue(value);
  const items = Array.isArray(field?.value)
    ? field.value.slice(0, maximumItems).map(normalize).filter((item): item is T => item !== null)
    : [];
  return {
    value: items.length > 0 ? items : null,
    confidence: confidence(field?.confidence),
    sourcePage: sourcePage(field?.sourcePage, pageCount),
  };
}

function normalizeWorkExperience(value: unknown): WorkExperienceEntry | null {
  const item = objectValue(value);
  if (!item) return null;
  const result = {
    employer: text(item.employer, 160),
    jobTitle: text(item.jobTitle, 160),
    location: text(item.location, 160),
    startDate: text(item.startDate, 40),
    endDate: text(item.endDate, 40),
    description: text(item.description, 2_000),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

function normalizeEducation(value: unknown): EducationEntry | null {
  const item = objectValue(value);
  if (!item) return null;
  const result = {
    institution: text(item.institution, 200),
    degree: text(item.degree, 160),
    fieldOfStudy: text(item.fieldOfStudy, 160),
    startDate: text(item.startDate, 40),
    endDate: text(item.endDate, 40),
    description: text(item.description, 2_000),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

function normalizeCertification(value: unknown): CertificationEntry | null {
  const item = objectValue(value);
  if (!item) return null;
  const result = {
    name: text(item.name, 200),
    issuer: text(item.issuer, 160),
    issuedDate: text(item.issuedDate, 40),
    expiryDate: text(item.expiryDate, 40),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

function normalizeLanguage(value: unknown): LanguageEntry | null {
  const item = objectValue(value);
  if (!item) return null;
  const result = {
    name: text(item.name, 120),
    proficiency: text(item.proficiency, 120),
  };
  return result.name ? result : null;
}

function legacy<T>(
  profile: ProfileValue<T>,
  fallback?: ExtractedValue<T>,
): ExtractedValue<T> {
  const hasValue = Array.isArray(profile.value)
    ? profile.value.length > 0
    : typeof profile.value === "string"
      ? profile.value.length > 0
      : profile.value !== null;
  if (!hasValue && fallback) return fallback;
  return {
    value: profile.value,
    confidence: profile.confidence,
    sourcePage: profile.sourcePage,
    verification: "extracted",
    lastEditedBy: null,
  };
}

function mapped<T>(
  field: ProfileValue<T[]>,
  format: (value: T) => string,
): ProfileValue<string[]> {
  const values = field.value?.map(format).filter(Boolean) ?? [];
  return { ...field, value: values.length > 0 ? values : null };
}

function mergeStringList(
  profile: ProfileValue<string[]>,
  fallback: ExtractedValue<string[]>,
): ProfileValue<string[]> {
  const values = uniqueStrings(
    [...(profile.value ?? []), ...(fallback.value ?? [])],
    100,
    500,
  );
  return {
    value: values.length > 0 ? values : null,
    confidence: Math.max(profile.confidence, fallback.confidence),
    sourcePage: profile.sourcePage ?? fallback.sourcePage,
  };
}

function prefill(field: ProfileValue<string | string[]>): CandidateProfilePrefillValue {
  return {
    value: Array.isArray(field.value) ? field.value.join("\n") : field.value ?? "",
    confidence: field.confidence,
    sourcePage: field.sourcePage,
  };
}

function sectionPrefill<T>(value: string, field: ProfileValue<T[]>): CandidateProfilePrefillValue {
  return { value, confidence: field.confidence, sourcePage: field.sourcePage };
}

function verified<T>(value: T): ProfileValue<T> {
  return { value, confidence: 1, sourcePage: null };
}

function formatWorkExperience(value: WorkExperienceEntry): string {
  const heading = [value.jobTitle, value.employer].filter(Boolean).join(" at ");
  const dates = [value.startDate, value.endDate].filter(Boolean).join(" – ");
  return [heading, value.location, dates, value.description].filter(Boolean).join(" · ");
}

function formatEducation(value: EducationEntry): string {
  const qualification = [value.degree, value.fieldOfStudy].filter(Boolean).join(" in ");
  const dates = [value.startDate, value.endDate].filter(Boolean).join(" – ");
  return [qualification, value.institution, dates, value.description].filter(Boolean).join(" · ");
}

function formatCertification(value: CertificationEntry): string {
  return [value.name, value.issuer, value.issuedDate, value.expiryDate].filter(Boolean).join(" · ");
}

function formatLanguage(value: LanguageEntry): string {
  return [value.name, value.proficiency].filter(Boolean).join(" — ");
}

function findLink(links: string[], host: string): string {
  return links.find((link) => link.toLocaleLowerCase().includes(host)) ?? "";
}

function findPortfolio(links: string[]): string {
  return links.find((link) => !link.toLocaleLowerCase().includes("linkedin.com")) ?? "";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function confidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0;
}

function sourcePage(value: unknown, pageCount: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= pageCount
    ? value
    : null;
}

function text(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function uniqueStrings(
  values: unknown[],
  maximumItems: number,
  maximumLength: number,
): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = text(value, maximumLength);
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key) || seen.size >= maximumItems) return [];
    seen.add(key);
    return [item];
  });
}
