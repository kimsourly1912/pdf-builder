import type { CandidatePrefillKey } from "@/features/resumes/resume.types";

export type CandidatePrefillGroup =
  | "Identity"
  | "Contact"
  | "Current employment"
  | "Experience"
  | "Education"
  | "Additional";

export type CandidatePrefillOption = {
  key: CandidatePrefillKey;
  label: string;
  group: CandidatePrefillGroup;
  keywords: string[];
  description: string;
};

export const CANDIDATE_PREFILL_OPTIONS: CandidatePrefillOption[] = [
  option("candidate.full_name", "Full name", "Identity", ["name", "candidate"], "Candidate's complete name"),
  option("candidate.first_name", "First name", "Identity", ["given name"], "Candidate's given name"),
  option("candidate.last_name", "Last name", "Identity", ["family name", "surname"], "Candidate's family name"),
  option("candidate.date_of_birth", "Date of birth", "Identity", ["dob", "birthday"], "Date-only birth date"),
  option("candidate.gender", "Gender", "Identity", ["sex"], "Extracted or verified gender"),
  option("candidate.nationality", "Nationality", "Identity", ["citizenship"], "Extracted or verified nationality"),
  option("candidate.primary_email", "Primary email", "Contact", ["email", "mail"], "Preferred email address"),
  option("candidate.email", "Email", "Contact", ["email address"], "Candidate email address"),
  option("candidate.primary_phone", "Primary phone", "Contact", ["mobile", "telephone"], "Preferred phone number"),
  option("candidate.phone", "Phone", "Contact", ["mobile number"], "Candidate phone number"),
  option("candidate.address", "Address", "Contact", ["residence", "location"], "Candidate address"),
  option("candidate.linkedin_url", "LinkedIn URL", "Contact", ["linkedin", "social"], "LinkedIn profile URL"),
  option("candidate.portfolio_url", "Portfolio URL", "Contact", ["website", "personal site"], "Portfolio or personal website"),
  option("candidate.links", "All links", "Contact", ["urls", "websites"], "All extracted links, one per line"),
  option("candidate.current_job_title", "Current job title", "Current employment", ["position", "role"], "Current role or position"),
  option("candidate.current_title", "Current title", "Current employment", ["job title"], "Candidate's current title"),
  option("candidate.current_employer", "Current employer", "Current employment", ["company", "organization"], "Current company or employer"),
  option("candidate.latest_job_title", "Latest job title", "Experience", ["recent role"], "Most recent work-experience title"),
  option("candidate.latest_employer", "Latest employer", "Experience", ["recent company"], "Most recent work-experience employer"),
  option("candidate.latest_job_start_date", "Latest job start date", "Experience", ["employment start"], "Start date of the latest position"),
  option("candidate.latest_job_end_date", "Latest job end date", "Experience", ["employment end"], "End date of the latest position"),
  option("candidate.professional_summary", "Professional summary", "Experience", ["career summary", "about"], "Resume professional summary"),
  option("candidate.skills", "Skills", "Experience", ["competencies", "abilities"], "Skills, one per line"),
  option("candidate.work_experience", "Work experience", "Experience", ["employment history", "jobs"], "Formatted work history"),
  option("candidate.highest_degree", "Highest degree", "Education", ["qualification"], "Highest extracted degree"),
  option("candidate.highest_institution", "Highest institution", "Education", ["school", "university"], "Institution for the highest qualification"),
  option("candidate.education", "Education history", "Education", ["academic background"], "Formatted education history"),
  option("candidate.certifications", "Certifications", "Additional", ["licenses", "certificates"], "Certifications, one per line"),
  option("candidate.languages", "Languages", "Additional", ["language proficiency"], "Languages, one per line"),
];

export const CANDIDATE_PREFILL_GROUPS: CandidatePrefillGroup[] = [
  "Identity",
  "Contact",
  "Current employment",
  "Experience",
  "Education",
  "Additional",
];

export function candidatePrefillLabel(key: CandidatePrefillKey): string {
  return CANDIDATE_PREFILL_OPTIONS.find((item) => item.key === key)?.label
    ?? key.replace(/^candidate\./u, "").replaceAll("_", " ").replace(/^./u, (letter) => letter.toUpperCase());
}

function option(
  key: CandidatePrefillKey,
  label: string,
  group: CandidatePrefillGroup,
  keywords: string[],
  description: string,
): CandidatePrefillOption {
  return { key, label, group, keywords, description };
}
