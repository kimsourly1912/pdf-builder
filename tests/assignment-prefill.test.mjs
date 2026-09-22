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

const preview = await vite.ssrLoadModule(
  "/features/accounts/assignment-prefill.ts",
);

test("builds a reviewable assignment autofill preview", () => {
  const result = preview.buildAssignmentAutofillPreview({
    recipientRoleId: "candidate-role",
    profile: {
      id: "profile-2",
      candidateId: "candidate-1",
      candidateName: "Sokha Chan",
      email: "sokha@example.com",
      phone: "+855 12 345 678",
      currentTitle: "Backend Developer",
      versionNumber: 2,
      verificationStatus: "extracted",
      fileName: "sokha-resume.pdf",
      appliedPosition: "Backend Developer",
      receivedDate: "2026-09-20",
      createdAt: "2026-09-20T00:00:00.000Z",
      linkedToAccount: true,
    },
    annotations: [
      { id: "name", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", recipientRoleId: "candidate-role", fieldName: "Full name", prefillKey: "candidate.full_name" },
      { id: "phone", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", recipientRoleId: "candidate-role", fieldName: "Phone", prefillKey: "candidate.primary_phone" },
      { id: "notes", page: 1, type: "textarea", x: 0, y: 0, width: 1, height: 1, color: "#000", recipientRoleId: "candidate-role", fieldName: "Notes" },
      { id: "hr-only", page: 1, type: "input", x: 0, y: 0, width: 1, height: 1, color: "#000", recipientRoleId: "hr-role", prefillKey: "candidate.email" },
    ],
    snapshot: {
      values: { name: "Sokha Chan" },
      metadata: {
        name: {
          prefillKey: "candidate.full_name",
          candidateId: "candidate-1",
          candidateProfileVersionId: "profile-2",
          confidence: 0.72,
          sourcePage: 1,
          source: "candidate_profile",
          verificationStatus: "extracted",
        },
      },
    },
  });

  assert.deepEqual(result.summary, {
    totalFields: 3,
    mappedFields: 2,
    filledFields: 1,
    emptyFields: 1,
    needsReviewFields: 1,
    unmappedFields: 1,
  });
  assert.equal(result.fields[0].status, "needs_review");
  assert.equal(result.fields[1].status, "empty");
});


test("stores only approved fields as recipient suggestions", () => {
  const snapshot = {
    values: {
      name: "Sokha Chan",
      email: "sokha@example.com",
    },
    metadata: {
      name: {
        prefillKey: "candidate.full_name",
        candidateId: "candidate-1",
        candidateProfileVersionId: "profile-2",
        confidence: 0.94,
        sourcePage: 1,
        source: "candidate_profile",
        verificationStatus: "verified",
      },
      email: {
        prefillKey: "candidate.primary_email",
        candidateId: "candidate-1",
        candidateProfileVersionId: "profile-2",
        confidence: 0.91,
        sourcePage: 1,
        source: "candidate_profile",
        verificationStatus: "verified",
      },
    },
  };
  const stored = preview.buildAssignmentPrefillStorage({
    mode: "suggested",
    snapshot,
    allowedFieldIds: ["email", "not-a-template-field"],
  });

  assert.deepEqual(stored.initialValues, {});
  assert.deepEqual(stored.availableValues, {
    email: "sokha@example.com",
  });
  assert.deepEqual(stored.approvedFieldIds, ["email"]);
  assert.equal(stored.availableMetadata.email.candidateId, "candidate-1");
});

test("automatic and disabled modes keep their snapshots separate", () => {
  const snapshot = {
    values: { name: "Sokha Chan" },
    metadata: {},
  };
  const automatic = preview.buildAssignmentPrefillStorage({
    mode: "automatic",
    snapshot,
    allowedFieldIds: ["name"],
  });
  const disabled = preview.buildAssignmentPrefillStorage({
    mode: "none",
    snapshot,
    allowedFieldIds: ["name"],
  });

  assert.deepEqual(automatic.initialValues, { name: "Sokha Chan" });
  assert.deepEqual(automatic.availableValues, {});
  assert.deepEqual(disabled.initialValues, {});
  assert.deepEqual(disabled.availableValues, {});
});


test("defaults to verified high-confidence fields only", () => {
  assert.deepEqual(
    preview.defaultApprovedPrefillFieldIds([
      {
        fieldId: "verified",
        fieldLabel: "Verified",
        prefillKey: "candidate.full_name",
        value: "Sokha Chan",
        confidence: 0.95,
        sourcePage: 1,
        verificationStatus: "verified",
        status: "filled",
      },
      {
        fieldId: "review",
        fieldLabel: "Review",
        prefillKey: "candidate.phone",
        value: "+855 12 345 678",
        confidence: 0.7,
        sourcePage: 1,
        verificationStatus: "extracted",
        status: "needs_review",
      },
      {
        fieldId: "empty",
        fieldLabel: "Empty",
        prefillKey: "candidate.email",
        value: "",
        confidence: null,
        sourcePage: null,
        verificationStatus: null,
        status: "empty",
      },
    ]),
    ["verified"],
  );
});
