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

const binding = await vite.ssrLoadModule("/features/templates/label-binding.ts");

const field = (overrides = {}) => ({
  id: "field-a8f2",
  page: 1,
  type: "input",
  x: 0.4,
  y: 0.2,
  width: 0.3,
  height: 0.05,
  color: "#000000",
  fieldName: "Position",
  labelBinding: {
    text: "Position",
    sourceText: "បុគ្គលិកផ្នែក: (Position)",
    page: 1,
    rect: { x: 0.05, y: 0.2, width: 0.2, height: 0.05 },
    source: "pdf-text",
  },
  ...overrides,
});

test("creates stable machine keys from PDF labels", () => {
  assert.equal(binding.createFieldKey("Date of Birth"), "date_of_birth");
});

test("builds self-describing answers in tab order", () => {
  const answers = binding.buildSubmissionAnswers(
    [field({ id: "second", tabIndex: 2 }), field({ id: "first", fieldName: "Khmer Name", fieldKey: "khmer_name", tabIndex: 1 })],
    { first: "គឹម សួរ", second: "Frontend Developer" },
  );
  assert.deepEqual(answers.map(({ fieldId, key, label, value }) => ({ fieldId, key, label, value })), [
    { fieldId: "first", key: "khmer_name", label: "Position", value: "គឹម សួរ" },
    { fieldId: "second", key: "position", label: "Position", value: "Frontend Developer" },
  ]);
});

test("detects duplicate field keys before a template is saved", () => {
  assert.deepEqual([...binding.duplicateFieldKeys([field(), field({ id: "other" })])], ["position"]);
});

test("creates stable unique keys for duplicated recipient fields", () => {
  const existing = [
    field(),
    field({ id: "second", fieldKey: "position_2" }),
  ];
  assert.equal(
    binding.createUniqueFieldKey("position", existing),
    "position_3",
  );

  const longKey = "a".repeat(64);
  const uniqueLongKey = binding.createUniqueFieldKey(
    longKey,
    [field({ fieldKey: longKey })],
  );
  assert.equal(uniqueLongKey.length, 64);
  assert.equal(uniqueLongKey.endsWith("_2"), true);
});
