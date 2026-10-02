import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { PDFDocument, PDFName, PDFString, degrees } from "pdf-lib";
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

const detection = await vite.ssrLoadModule(
  "/features/ai-field-detection/field-detection.ts",
);
const review = await vite.ssrLoadModule(
  "/features/ai-field-detection/field-detection-review.ts",
);
const acroFormDetection = await vite.ssrLoadModule(
  "/features/ai-field-detection/acroform-field-detection.ts",
);
const hybridDetection = await vite.ssrLoadModule(
  "/features/ai-field-detection/hybrid-field-detection.ts",
);

function rawField(overrides = {}) {
  return {
    page: 1,
    label: "Date of Birth",
    suggestedKey: "date_of_birth",
    tool: "date",
    validation: "none",
    labelBox: { x: 0.1, y: 0.2, width: 0.2, height: 0.03 },
    fieldBox: { x: 0.35, y: 0.2, width: 0.25, height: 0.05 },
    required: true,
    confidence: 0.94,
    evidence: "A date label followed by an empty rectangle.",
    options: [],
    ...overrides,
  };
}

test("normalizes model output, coordinates, keys, and dropdown safety", () => {
  let id = 0;
  const result = detection.normalizeFieldDetectionResult({
    value: {
      fields: [
        rawField(),
        rawField({
          label: "Department",
          suggestedKey: "date_of_birth",
          tool: "dropdown",
          fieldBox: { x: 0.9, y: 0.98, width: 0.4, height: 0.2 },
          options: ["IT"],
        }),
        rawField({ page: 8 }),
        rawField({ tool: "signature" }),
      ],
    },
    pageCount: 2,
    engine: "test",
    idFactory: () => `candidate-${++id}`,
  });

  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].suggestedKey, "date_of_birth");
  assert.equal(result.candidates[1].suggestedKey, "date_of_birth_2");
  assert.equal(result.candidates[1].tool, "input");
  assert.equal(result.candidates[0].source, "ai");
  assert.equal(result.candidates[0].suggestedPrefillKey, "candidate.date_of_birth");
  assert.ok(Math.abs(result.candidates[1].fieldBox.width - 0.1) < 1e-10);
  assert.ok(Math.abs(result.candidates[1].fieldBox.height - 0.02) < 1e-10);
});

test("extracts supported AcroForm widgets with normalized page geometry", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 800]);
  const rotatedPage = document.addPage([600, 800]);
  rotatedPage.setRotation(degrees(90));
  const form = document.getForm();

  const email = form.createTextField("person.email");
  email.acroField.dict.set(PDFName.of("TU"), PDFString.of("Email address"));
  email.enableRequired();
  email.addToPage(page, { x: 120, y: 640, width: 240, height: 32 });

  const notes = form.createTextField("application.notes");
  notes.enableMultiline();
  notes.addToPage(page, { x: 120, y: 500, width: 300, height: 96 });

  const birthDate = form.createTextField("birthDate");
  birthDate.addToPage(rotatedPage, { x: 80, y: 620, width: 180, height: 32 });

  const consent = form.createCheckBox("termsAccepted");
  consent.addToPage(page, { x: 120, y: 440, width: 20, height: 20 });

  const department = form.createDropdown("department");
  department.addOptions(["Engineering", "Finance", "Engineering"]);
  department.addToPage(page, { x: 120, y: 380, width: 200, height: 32 });

  const readOnly = form.createTextField("internalId");
  readOnly.enableReadOnly();
  readOnly.addToPage(page, { x: 120, y: 320, width: 200, height: 32 });

  const unsupported = form.createButton("submitButton");
  unsupported.addToPage("Submit", page, {
    x: 120,
    y: 260,
    width: 100,
    height: 32,
  });

  const bytes = await document.save();
  const result = await acroFormDetection.detectAcroFormFields({ bytes });

  assert.equal(result.totalFields, 7);
  assert.equal(result.readOnlyFields, 1);
  assert.equal(result.unsupportedFields, 1);
  assert.equal(result.candidates.length, 5);
  assert.ok(result.candidates.every((candidate) => candidate.source === "acroform"));

  const byKey = Object.fromEntries(
    result.candidates.map((candidate) => [candidate.suggestedKey, candidate]),
  );
  assert.equal(byKey.person_email.label, "Email address");
  assert.equal(byKey.person_email.tool, "input");
  assert.equal(byKey.person_email.validation, "email");
  assert.equal(byKey.person_email.required, true);
  assert.equal(byKey.application_notes.tool, "textarea");
  assert.equal(byKey.birth_date.tool, "date");
  assert.equal(byKey.birth_date.page, 2);
  assert.equal(byKey.terms_accepted.tool, "checkbox");
  assert.equal(byKey.department.tool, "dropdown");
  assert.deepEqual(byKey.department.options, ["Engineering", "Finance"]);
  assertBox(byKey.person_email.fieldBox, {
    x: 0.2,
    y: 0.16,
    width: 0.4,
    height: 0.04,
  });
  assertBox(byKey.birth_date.fieldBox, {
    x: 0.775,
    y: 0.13333333333333333,
    width: 0.04,
    height: 0.3,
  });
});

test("merges visual AI duplicates while retaining deterministic widget geometry", () => {
  const embedded = {
    ...rawField({
      label: "Field 1",
      suggestedKey: "field_1",
      tool: "input",
      validation: "none",
      fieldBox: { x: 0.35, y: 0.2, width: 0.25, height: 0.05 },
      confidence: 0.86,
    }),
    candidateId: "acroform:1:1:1",
    source: "acroform",
  };
  const visualMatch = {
    ...rawField({
      label: "Date of Birth",
      suggestedKey: "date_of_birth",
      validation: "none",
      fieldBox: { x: 0.36, y: 0.205, width: 0.24, height: 0.045 },
    }),
    candidateId: "ai-1",
    source: "ai",
  };
  const visualOnly = {
    ...rawField({
      label: "Comments",
      suggestedKey: "comments",
      tool: "textarea",
      fieldBox: { x: 0.2, y: 0.6, width: 0.5, height: 0.2 },
    }),
    candidateId: "ai-2",
    source: "ai",
  };

  const result = hybridDetection.mergeHybridFieldDetection({
    acroForm: {
      candidates: [embedded],
      totalFields: 3,
      readOnlyFields: 1,
      unsupportedFields: 1,
    },
    ai: {
      schemaVersion: 1,
      engine: "test-ai",
      candidates: [visualMatch, visualOnly],
    },
  });

  assert.equal(result.engine, "hybrid:acroform+test-ai");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].source, "hybrid");
  assert.equal(result.candidates[0].label, "Date of Birth");
  assert.equal(result.candidates[0].suggestedKey, "field_1");
  assert.deepEqual(result.candidates[0].fieldBox, embedded.fieldBox);
  assert.equal(result.candidates[1].source, "ai");
  assert.deepEqual(result.pipeline, {
    strategy: "hybrid",
    acroFormCandidates: 1,
    aiCandidates: 2,
    duplicatesMerged: 1,
    readOnlyAcroFormFields: 1,
    unsupportedAcroFormFields: 1,
  });
});

test("converts approved candidates to editable annotations without publishing", () => {
  const normalized = detection.normalizeFieldDetectionResult({
    value: {
      fields: [rawField(), rawField({ label: "Birth date", suggestedKey: "date_of_birth" })],
    },
    pageCount: 2,
    engine: "test",
    idFactory: (() => {
      let id = 0;
      return () => `candidate-${++id}`;
    })(),
  });
  const existing = {
    id: "existing",
    page: 1,
    type: "input",
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.04,
    color: "#000000",
    fieldKey: "date_of_birth",
    recipientRoleId: "recipient-1",
  };
  let id = 0;
  const result = detection.buildDetectedAnnotations({
    candidates: normalized.candidates,
    annotations: [existing],
    pageOrder: [{ sourcePage: 2 }, { sourcePage: 1 }],
    recipientRoleId: "recipient-1",
    idFactory: () => `generated-${++id}`,
  });

  assert.equal(result.annotations.length, 3);
  assert.equal(result.addedIds.length, 2);
  assert.equal(result.annotations[1].page, 2);
  assert.equal(result.annotations[1].fieldKey, "date_of_birth_2");
  assert.equal(result.annotations[2].fieldKey, "date_of_birth_3");
  assert.equal(result.annotations[1].labelBinding.source, "ai-detection");
  assert.equal(result.annotations[1].aiDetection.schemaVersion, 1);
  assert.equal(result.annotations[1].prefillKey, "candidate.date_of_birth");
});

test("classifies confidence bands used by the review UI", () => {
  assert.equal(detection.confidenceBand(0.91), "high");
  assert.equal(detection.confidenceBand(0.7), "review");
  assert.equal(detection.confidenceBand(0.4), "low");
});

test("persists only reviewed edits while preserving detected geometry", () => {
  let id = 0;
  const normalized = detection.normalizeFieldDetectionResult({
    value: {
      fields: [
        rawField(),
        rawField({ label: "Email", suggestedKey: "email", tool: "input" }),
      ],
    },
    pageCount: 1,
    engine: "test",
    idFactory: () => `candidate-${++id}`,
  });
  const reviewed = review.parseReviewedFieldCandidates({
    detected: normalized.candidates,
    value: [
      {
        candidateId: "candidate-1",
        label: "Birth date (required)",
        suggestedKey: "birth date",
        tool: "input",
        fieldBox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  });

  assert.equal(reviewed.length, 1);
  assert.equal(reviewed[0].label, "Birth date (required)");
  assert.equal(reviewed[0].suggestedKey, "birth_date");
  assert.equal(reviewed[0].tool, "input");
  assert.deepEqual(
    reviewed[0].fieldBox,
    normalized.candidates[0].fieldBox,
    "client review cannot move the server-detected geometry",
  );
});

test("rejects unknown, duplicate, and unsafe reviewed candidates", () => {
  const normalized = detection.normalizeFieldDetectionResult({
    value: { fields: [rawField()] },
    pageCount: 1,
    engine: "test",
    idFactory: () => "candidate-1",
  });
  const valid = {
    candidateId: "candidate-1",
    label: "Date of Birth",
    suggestedKey: "date_of_birth",
    tool: "date",
  };

  assert.equal(
    review.parseReviewedFieldCandidates({
      detected: normalized.candidates,
      value: [{ ...valid, candidateId: "unknown" }],
    }),
    null,
  );
  assert.equal(
    review.parseReviewedFieldCandidates({
      detected: normalized.candidates,
      value: [valid, valid],
    }),
    null,
  );
  assert.equal(
    review.parseReviewedFieldCandidates({
      detected: normalized.candidates,
      value: [{ ...valid, tool: "dropdown" }],
    }),
    null,
  );
});

test("calculates reproducible evaluation metrics", () => {
  const expected = [rawField(), rawField({ label: "Email", tool: "input", fieldBox: { x: 0.2, y: 0.5, width: 0.3, height: 0.05 } })];
  const predicted = [
    rawField({ fieldBox: { x: 0.35, y: 0.2, width: 0.25, height: 0.05 } }),
    rawField({ label: "Email address", tool: "textarea", fieldBox: { x: 0.2, y: 0.5, width: 0.3, height: 0.05 } }),
    rawField({ label: "Unrelated", tool: "input", fieldBox: { x: 0.7, y: 0.8, width: 0.2, height: 0.05 } }),
  ];
  const metrics = detection.evaluateFieldDetection({ expected, predicted });

  assert.equal(metrics.matchedCount, 2);
  assert.equal(metrics.precision, 2 / 3);
  assert.equal(metrics.recall, 1);
  assert.equal(metrics.toolAccuracy, 0.5);
  assert.ok(Math.abs(metrics.meanFieldIou - 1) < 1e-10);
  assert.equal(metrics.usablePositionRate, 1);
});

function assertBox(actual, expected) {
  for (const key of ["x", "y", "width", "height"]) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 0.002,
      `${key} differs: expected ${expected[key]}, received ${actual[key]}`,
    );
  }
}
