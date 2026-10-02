import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => vite.close());

const profiles = await vite.ssrLoadModule("/features/resumes/candidate-profile.ts");
const evaluation = await vite.ssrLoadModule("/features/resumes/resume-evaluation.ts");

function field(value, confidence = 0.9, sourcePage = 1) {
  return { value, confidence, sourcePage };
}

function rawProfile() {
  return {
    schemaVersion: 2,
    identity: {
      fullName: field("Sokha Chan"),
      firstName: field("Sokha"),
      lastName: field("Chan"),
      dateOfBirth: field(null, 0, null),
      gender: field(null, 0, null),
      nationality: field("Cambodian"),
    },
    contact: {
      primaryEmail: field("sokha@example.com"),
      emails: field(["sokha@example.com"]),
      primaryPhone: field("+855 12 345 678"),
      phones: field(["+855 12 345 678"]),
      address: field("Phnom Penh"),
      linkedinUrl: field("https://linkedin.com/in/sokha"),
      portfolioUrl: field(null, 0, null),
      links: field(["https://linkedin.com/in/sokha"]),
    },
    professional: {
      currentTitle: field("Backend Developer"),
      currentEmployer: field("Example Co"),
      summary: field("Builds reliable APIs."),
      skills: field(["TypeScript", "Cloudflare"]),
    },
    workExperience: field([{ employer: "Example Co", jobTitle: "Backend Developer", location: "Phnom Penh", startDate: "2024-01", endDate: "Present", description: "Built APIs" }]),
    education: field([{ institution: "RUPP", degree: "BSc", fieldOfStudy: "Computer Science", startDate: "2019", endDate: "2023", description: "" }], 0.85, 2),
    certifications: field(null, 0, null),
    languages: field([{ name: "Khmer", proficiency: "Native" }]),
  };
}

test("normalizes structured candidate profiles and projects legacy fields", () => {
  const profile = profiles.normalizeCandidateProfile(rawProfile(), 2);
  assert.ok(profile);
  const fields = profiles.profileToResumeFields(profile);
  assert.equal(fields.fullName.value, "Sokha Chan");
  assert.deepEqual(fields.skills.value, ["TypeScript", "Cloudflare"]);
  assert.match(fields.workExperience.value[0], /Backend Developer at Example Co/u);
  assert.equal(fields.education.sourcePage, 2);
});

test("rejects invalid source pages without losing safe values", () => {
  const value = rawProfile();
  value.identity.fullName.sourcePage = 99;
  const profile = profiles.normalizeCandidateProfile(value, 2);
  assert.ok(profile);
  assert.equal(profile.identity.fullName.sourcePage, null);
});

test("evaluates extracted values with deterministic metrics", () => {
  const profile = profiles.normalizeCandidateProfile(rawProfile(), 2);
  const result = evaluation.evaluateResumeProfile({
    expected: {
      "candidate.full_name": "Sokha Chan",
      "candidate.primary_email": "sokha@example.com",
      "candidate.current_employer": "Example Co",
    },
    predicted: profile,
  });
  assert.equal(result.matchedCount, 3);
  assert.equal(result.recall, 1);
  assert.equal(result.meanValueSimilarity, 1);
});
