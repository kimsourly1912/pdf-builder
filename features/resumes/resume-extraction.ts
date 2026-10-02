import type {
  ExtractedValue,
  ResumeExtractionFields,
  ResumeExtractionPayload,
} from "@/features/resumes/resume.types";

type ResumeTextPage = { pageNumber: number; text: string };

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{6,}\d)/gu;
const LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s,;]+/giu;
const SECTION_HEADINGS = new Set([
  "about",
  "career objective",
  "certifications",
  "education",
  "experience",
  "languages",
  "professional summary",
  "profile",
  "skills",
  "summary",
  "work experience",
]);
const DOCUMENT_TITLES = new Set(["curriculum vitae", "cv", "resume", "résumé"]);

export function extractResumeProfile(
  pages: ResumeTextPage[],
): ResumeExtractionPayload {
  const lines = pages.flatMap((page) =>
    page.text
      .split(/\r?\n/gu)
      .map((text) => ({ pageNumber: page.pageNumber, text: cleanText(text) }))
      .filter((line) => line.text.length > 0),
  );
  const allText = lines.map((line) => line.text).join("\n");
  const emails = uniqueMatches(allText, EMAIL_PATTERN).map((value) =>
    value.toLowerCase(),
  );
  const phones = uniqueMatches(allText, PHONE_PATTERN)
    .map(cleanPhoneDisplay)
    .filter((value) => {
      const digitCount = value.replace(/\D/gu, "").length;
      return digitCount >= 8 && digitCount <= 15 && !/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/u.test(value);
    });
  const links = uniqueMatches(allText, LINK_PATTERN);
  const fullName = explicitValue(lines, ["full name", "name"])
    ?? probableName(lines);
  const nameParts = splitName(fullName?.value ?? null);
  const address = explicitValue(lines, ["current address", "address"]);
  const dateOfBirth = explicitValue(lines, ["date of birth", "birth date", "dob"]);
  const gender = explicitValue(lines, ["gender", "sex"]);
  const nationality = explicitValue(lines, ["nationality"]);
  const currentTitle = explicitValue(lines, ["current position", "position", "job title", "title"])
    ?? probableTitle(lines, fullName?.lineIndex ?? -1);
  const professionalSummary = sectionValue(lines, [
    "professional summary",
    "career objective",
    "summary",
    "profile",
    "about",
  ]);
  const skills = sectionList(lines, ["skills"]);
  const workExperience = sectionList(lines, ["work experience", "experience"]);
  const education = sectionList(lines, ["education"]);
  const certifications = sectionList(lines, ["certifications"]);
  const languages = sectionList(lines, ["languages"]);

  const fields: ResumeExtractionFields = {
    fullName: scalar(fullName?.value ?? null, fullName?.pageNumber ?? null, fullName ? 0.82 : 0),
    firstName: scalar(nameParts.firstName, fullName?.pageNumber ?? null, nameParts.firstName ? 0.72 : 0),
    lastName: scalar(nameParts.lastName, fullName?.pageNumber ?? null, nameParts.lastName ? 0.72 : 0),
    phones: collection(phones, pageForMatch(lines, phones[0]), phones.length > 0 ? 0.9 : 0),
    emails: collection(emails, pageForMatch(lines, emails[0]), emails.length > 0 ? 0.98 : 0),
    address: scalar(address?.value ?? null, address?.pageNumber ?? null, address ? 0.9 : 0),
    dateOfBirth: scalar(dateOfBirth?.value ?? null, dateOfBirth?.pageNumber ?? null, dateOfBirth ? 0.88 : 0),
    gender: scalar(gender?.value ?? null, gender?.pageNumber ?? null, gender ? 0.92 : 0),
    nationality: scalar(nationality?.value ?? null, nationality?.pageNumber ?? null, nationality ? 0.92 : 0),
    currentTitle: scalar(currentTitle?.value ?? null, currentTitle?.pageNumber ?? null, currentTitle ? 0.72 : 0),
    professionalSummary: scalar(professionalSummary?.value ?? null, professionalSummary?.pageNumber ?? null, professionalSummary ? 0.75 : 0),
    skills: collection(skills.values, skills.pageNumber, skills.values.length > 0 ? 0.72 : 0),
    workExperience: collection(workExperience.values, workExperience.pageNumber, workExperience.values.length > 0 ? 0.68 : 0),
    education: collection(education.values, education.pageNumber, education.values.length > 0 ? 0.72 : 0),
    certifications: collection(certifications.values, certifications.pageNumber, certifications.values.length > 0 ? 0.72 : 0),
    languages: collection(languages.values, languages.pageNumber, languages.values.length > 0 ? 0.72 : 0),
    links: collection(links, pageForMatch(lines, links[0]), links.length > 0 ? 0.95 : 0),
  };
  const totalCharacters = pages.reduce((total, page) => total + page.text.trim().length, 0);

  return {
    schemaVersion: 1,
    engine: "pdf-text-heuristic-v1",
    pageCount: pages.length,
    scannedPageCount: pages.filter((page) => page.text.trim().length < 12).length,
    totalCharacters,
    fields,
  };
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/gu, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function scalar<T>(
  value: T | null,
  sourcePage: number | null,
  confidence: number,
): ExtractedValue<T> {
  return {
    value,
    confidence,
    sourcePage,
    verification: "extracted",
    lastEditedBy: null,
  };
}

function collection<T>(
  values: T[],
  sourcePage: number | null,
  confidence: number,
): ExtractedValue<T[]> {
  return scalar(values.length > 0 ? values : null, sourcePage, confidence);
}

function explicitValue(
  lines: Array<{ pageNumber: number; text: string }>,
  labels: string[],
) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const label of labels) {
      const match = line.text.match(new RegExp(`^${escapeRegExp(label)}\\s*[:\\-]\\s*(.+)$`, "iu"));
      if (match?.[1]?.trim()) {
        return { value: match[1].trim(), pageNumber: line.pageNumber, lineIndex };
      }
      if (line.text.toLowerCase() === label && lines[lineIndex + 1]?.text) {
        return {
          value: lines[lineIndex + 1].text,
          pageNumber: lines[lineIndex + 1].pageNumber,
          lineIndex: lineIndex + 1,
        };
      }
    }
  }
  return null;
}

function probableName(lines: Array<{ pageNumber: number; text: string }>) {
  const firstPageLines = lines.slice(0, 12);
  for (let lineIndex = 0; lineIndex < firstPageLines.length; lineIndex += 1) {
    const line = firstPageLines[lineIndex];
    if (
      line.text.length >= 3 &&
      line.text.length <= 80 &&
      !line.text.includes("@") &&
      !/\d/u.test(line.text) &&
      !LINK_PATTERN.test(line.text) &&
      !SECTION_HEADINGS.has(line.text.toLowerCase()) &&
      !DOCUMENT_TITLES.has(line.text.toLowerCase()) &&
      line.text.split(/\s+/u).length <= 6
    ) {
      LINK_PATTERN.lastIndex = 0;
      return { value: line.text, pageNumber: line.pageNumber, lineIndex };
    }
    LINK_PATTERN.lastIndex = 0;
  }
  return null;
}

function probableTitle(
  lines: Array<{ pageNumber: number; text: string }>,
  nameLineIndex: number,
) {
  const start = Math.max(0, nameLineIndex + 1);
  for (let index = start; index < Math.min(lines.length, start + 5); index += 1) {
    const line = lines[index];
    if (
      line.text.length <= 100 &&
      !line.text.includes("@") &&
      !/^(?:\+?\d|https?:|www\.)/iu.test(line.text) &&
      !SECTION_HEADINGS.has(line.text.toLowerCase())
    ) {
      return { value: line.text, pageNumber: line.pageNumber, lineIndex: index };
    }
  }
  return null;
}

function sectionValue(
  lines: Array<{ pageNumber: number; text: string }>,
  headings: string[],
) {
  const section = sectionList(lines, headings, 5);
  return section.values.length > 0
    ? { value: section.values.join(" "), pageNumber: section.pageNumber }
    : null;
}

function sectionList(
  lines: Array<{ pageNumber: number; text: string }>,
  headings: string[],
  maximumLines = 12,
) {
  const index = lines.findIndex((line) =>
    headings.includes(line.text.toLowerCase().replace(/:$/u, "")),
  );
  if (index < 0) return { values: [] as string[], pageNumber: null as number | null };
  const values: string[] = [];
  for (let next = index + 1; next < lines.length && values.length < maximumLines; next += 1) {
    const text = lines[next].text;
    if (SECTION_HEADINGS.has(text.toLowerCase().replace(/:$/u, ""))) break;
    values.push(...splitListLine(text));
  }
  return { values: unique(values).slice(0, 40), pageNumber: lines[index].pageNumber };
}

function splitListLine(value: string): string[] {
  const stripped = value.replace(/^[•·▪◦*\-–—]\s*/u, "").trim();
  if (!stripped) return [];
  if (stripped.length < 140 && /[,|]/u.test(stripped)) {
    return stripped.split(/[,|]/u).map(cleanText).filter(Boolean);
  }
  return [stripped.slice(0, 500)];
}

function uniqueMatches(value: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return unique([...value.matchAll(pattern)].map((match) => match[0].replace(/[).,;]+$/u, "")));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitName(value: string | null) {
  if (!value) return { firstName: null, lastName: null };
  const parts = value.trim().split(/\s+/u);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function pageForMatch(
  lines: Array<{ pageNumber: number; text: string }>,
  value: string | undefined,
) {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/gu, "");
  return lines.find((line) =>
    line.text.toLowerCase().replace(/\s+/gu, "").includes(normalized),
  )?.pageNumber ?? null;
}

function cleanPhoneDisplay(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function cleanText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
