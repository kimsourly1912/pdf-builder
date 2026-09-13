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

const detection = await vite.ssrLoadModule(
  "/features/ai-field-detection/field-detection.ts",
);
const review = await vite.ssrLoadModule(
  "/features/ai-field-detection/field-detection-review.ts",
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
  assert.ok(Math.abs(result.candidates[1].fieldBox.width - 0.1) < 1e-10);
  assert.ok(Math.abs(result.candidates[1].fieldBox.height - 0.02) < 1e-10);
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
