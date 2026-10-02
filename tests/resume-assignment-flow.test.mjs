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

const candidatePrefill = await vite.ssrLoadModule(
  "/features/resumes/candidate-prefill.ts",
);
const assignmentPrefill = await vite.ssrLoadModule(
  "/features/accounts/assignment-prefill.ts",
);
const recipientPrefill = await vite.ssrLoadModule(
  "/features/templates/recipient-prefill.ts",
);
const validation = await vite.ssrLoadModule(
  "/features/templates/submission-validation.ts",
);

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
  dateOfBirth: null,
  gender: "",
  nationality: "Cambodian",
  currentTitle: "Developer",
  professionalSummary: "",
  skillsJson: "[]",
  workExperienceJson: "[]",
  educationJson: "[]",
  certificationsJson: "[]",
  languagesJson: "[]",
  linksJson: "[]",
  verificationStatus: "verified",
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
};

test("resume assignment flow stores option IDs and submits approved values", () => {
  const fields = [
    {
      id: "name",
      page: 1,
      type: "input",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      color: "#000",
      recipientRoleId: "candidate",
      fieldName: "Full name",
      prefillKey: "candidate.full_name",
      required: true,
    },
    {
      id: "nationality",
      page: 1,
      type: "dropdown",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      color: "#000",
      recipientRoleId: "candidate",
      fieldName: "Nationality",
      prefillKey: "candidate.nationality",
      required: true,
      options: [
        { id: "kh", label: "Cambodian" },
        { id: "other", label: "Other" },
      ],
    },
  ];
  const snapshot = candidatePrefill.buildCandidatePrefillSnapshot({
    candidate,
    annotations: fields,
    recipientRoleId: "candidate",
  });
  assert.deepEqual(snapshot.values, {
    name: "Sokha Chan",
    nationality: "kh",
  });

  const preview = assignmentPrefill.buildAssignmentAutofillPreview({
    annotations: fields,
    recipientRoleId: "candidate",
    snapshot,
    profile: {
      id: "profile-1",
      candidateId: "candidate-1",
      candidateName: "Sokha Chan",
      email: "sokha@example.com",
      phone: "+855 12 345 678",
      currentTitle: "Developer",
      versionNumber: 1,
      verificationStatus: "verified",
      fileName: "resume.pdf",
      appliedPosition: "",
      receivedDate: null,
      createdAt: "2026-09-22T00:00:00.000Z",
      linkedToAccount: true,
    },
  });
  const approved = assignmentPrefill.defaultApprovedPrefillFieldIds(
    preview.fields,
  );
  const stored = assignmentPrefill.buildAssignmentPrefillStorage({
    mode: "suggested",
    snapshot,
    allowedFieldIds: approved,
  });
  const recipientValues = recipientPrefill.applyResumeSuggestions({
    currentValues: { name: "", nationality: "" },
    suggestions: stored.availableValues,
    protectedFieldIds: [],
  });
  const result = validation.validateSubmissionValues({
    fields,
    values: recipientValues,
    imageFieldIds: new Set(),
  });
  assert.equal(result.ok, true);
});
