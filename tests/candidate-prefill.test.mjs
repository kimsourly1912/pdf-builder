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

const prefill = await vite.ssrLoadModule("/features/resumes/candidate-prefill.ts");

const candidate = {
  id: "candidate-1",
  ownerEmail: "owner@example.com",
  userId: "user-1",
  fullName: "Sokha Chan",
  firstName: "Sokha",
  lastName: "Chan",
  email: "sokha@example.com",
  normalizedEmail: "sokha@example.com",
  phone: "+855 12 345 678",
  normalizedPhone: "+85512345678",
  address: "Phnom Penh",
  dateOfBirth: "2000-01-02",
  gender: "",
  nationality: "Cambodian",
  currentTitle: "Backend Developer",
  professionalSummary: "Builds reliable APIs.",
  skillsJson: JSON.stringify(["TypeScript", "D1"]),
  workExperienceJson: "[]",
  educationJson: "[]",
  certificationsJson: "[]",
  languagesJson: JSON.stringify(["Khmer", "English"]),
  linksJson: "[]",
  verificationStatus: "verified",
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
};

test("creates an immutable assignment snapshot from explicit prefill keys", () => {
  const values = prefill.buildCandidatePrefillValues(candidate, [
    { id: "name", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", prefillKey: "candidate.full_name" },
    { id: "skills", page: 1, type: "textarea", x: 0, y: 0, width: 1, height: 1, color: "#000", prefillKey: "candidate.skills" },
    { id: "ignored", page: 1, type: "dropdown", x: 0, y: 0, width: 1, height: 1, color: "#000", prefillKey: "candidate.nationality" },
  ]);
  assert.deepEqual(values, {
    name: "Sokha Chan",
    skills: "TypeScript\nD1",
  });
});


test("suggests explicit candidate keys from form labels", () => {
  assert.equal(
    prefill.suggestCandidatePrefillKey("Email address", "email_address"),
    "candidate.primary_email",
  );
  assert.equal(
    prefill.suggestCandidatePrefillKey("Current employer", "company"),
    "candidate.current_employer",
  );
  assert.equal(prefill.suggestCandidatePrefillKey("Approval signature", "signature"), undefined);
});

test("prefills dropdowns only when an option matches exactly", () => {
  const snapshot = prefill.buildCandidatePrefillSnapshot({
    candidate,
    annotations: [
      {
        id: "nationality",
        page: 1,
        type: "dropdown",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        color: "#000",
        prefillKey: "candidate.nationality",
        options: [
          { id: "kh", label: "Cambodian" },
          { id: "other", label: "Other" },
        ],
      },
    ],
  });
  assert.deepEqual(snapshot.values, { nationality: "kh" });
  assert.equal(snapshot.metadata.nationality.source, "candidate_record");
});


test("limits assignment snapshots to the selected recipient role", () => {
  const snapshot = prefill.buildCandidatePrefillSnapshot({
    candidate,
    recipientRoleId: "candidate-role",
    annotations: [
      { id: "candidate-name", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", recipientRoleId: "candidate-role", prefillKey: "candidate.full_name" },
      { id: "hr-name", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", recipientRoleId: "hr-role", prefillKey: "candidate.full_name" },
      { id: "shared-email", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", prefillKey: "candidate.primary_email" },
    ],
  });
  assert.deepEqual(snapshot.values, {
    "candidate-name": "Sokha Chan",
    "shared-email": "sokha@example.com",
  });
  assert.equal(snapshot.metadata["candidate-name"].verificationStatus, "verified");
});
