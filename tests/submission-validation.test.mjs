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

const validation = await vite.ssrLoadModule(
  "/features/templates/submission-validation.ts",
);

const role = { id: "role-1", name: "Candidate", color: "#2563eb" };
const page = { id: "page-1", sourcePage: 1, rotation: 0 };
const field = (overrides = {}) => ({
  id: "field-1",
  page: 1,
  type: "input",
  x: 0.1,
  y: 0.1,
  width: 0.3,
  height: 0.1,
  color: "#000000",
  recipientRoleId: role.id,
  fieldName: "Email",
  fieldKey: "email",
  required: true,
  validation: "email",
  ...overrides,
});

test("validates the complete template definition and source page bounds", () => {
  assert.equal(
    validation.validateTemplateDefinition({
      annotations: [field()],
      pageOrder: [page],
      roles: [role],
      sourcePageCount: 1,
    }),
    null,
  );
  assert.equal(
    validation.validateTemplateDefinition({
      annotations: [field()],
      pageOrder: [{ ...page, sourcePage: 2 }],
      roles: [role],
      sourcePageCount: 1,
    }),
    "The template page order is invalid.",
  );
});

test("rejects unknown fields and validates exact field rules", () => {
  const fields = [
    field(),
    field({
      id: "choice",
      fieldName: "Choice",
      fieldKey: "choice",
      type: "dropdown",
      options: [{ id: "a", label: "A", checked: false }],
    }),
    field({ id: "date", fieldName: "Date", fieldKey: "date", type: "date" }),
  ];
  const unknown = validation.validateSubmissionValues({
    fields,
    values: { "field-1": "a@example.com", choice: "a", date: "2026-02-28", surprise: true },
    imageFieldIds: new Set(),
  });
  assert.equal(unknown.ok, false);

  const invalid = validation.validateSubmissionValues({
    fields,
    values: { "field-1": "not-email", choice: "bad", date: "2026-02-30" },
    imageFieldIds: new Set(),
  });
  assert.equal(invalid.ok, false);

  const valid = validation.validateSubmissionValues({
    fields,
    values: { "field-1": " candidate@example.com ", choice: "a", date: "2026-02-28" },
    imageFieldIds: new Set(),
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.values["field-1"], "candidate@example.com");
});

test("requires image files and rejects forged image values", () => {
  const image = field({
    id: "photo",
    fieldName: "Photo",
    fieldKey: "photo",
    type: "image-placeholder",
  });
  assert.equal(
    validation.validateSubmissionValues({ fields: [image], values: {}, imageFieldIds: new Set() }).ok,
    false,
  );
  assert.equal(
    validation.validateSubmissionValues({ fields: [image], values: { photo: "data:image/png;base64,fake" }, imageFieldIds: new Set(["photo"]) }).ok,
    false,
  );
  assert.equal(
    validation.validateSubmissionValues({ fields: [image], values: {}, imageFieldIds: new Set(["photo"]) }).ok,
    true,
  );
});

test("accepts textarea fields and enforces their required text", () => {
  const paragraph = field({
    id: "paragraph",
    fieldName: "Paragraph",
    fieldKey: "paragraph",
    type: "textarea",
    validation: "none",
  });
  assert.equal(
    validation.validateTemplateDefinition({
      annotations: [paragraph],
      pageOrder: [page],
      roles: [role],
      sourcePageCount: 1,
    }),
    null,
  );
  assert.equal(
    validation.validateSubmissionValues({
      fields: [paragraph],
      values: { paragraph: "   " },
      imageFieldIds: new Set(),
    }).ok,
    false,
  );
  const valid = validation.validateSubmissionValues({
    fields: [paragraph],
    values: { paragraph: " First line\nSecond line " },
    imageFieldIds: new Set(),
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.values.paragraph, "First line\nSecond line");
});
