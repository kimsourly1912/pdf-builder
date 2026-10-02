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

const prefill = await vite.ssrLoadModule(
  "/features/templates/recipient-prefill.ts",
);

test("a shared resume value only fits compatible fields in the recipient role", () => {
  const base = { id: "name", type: "input", recipientRoleId: "recipient" };
  assert.equal(prefill.resumeValueForField(base, "Sokha Chan", "recipient"), "Sokha Chan");
  assert.equal(prefill.resumeValueForField({ ...base, recipientRoleId: "hr" }, "Sokha Chan", "recipient"), null);
  assert.equal(prefill.resumeValueForField({ ...base, type: "date" }, "Sokha Chan", "recipient"), null);
  assert.equal(prefill.resumeValueForField({ ...base, type: "dropdown", options: [
    { id: "kh", label: "Cambodian" },
  ] }, "Cambodian", "recipient"), "kh");
});

test("bulk resume fill preserves values already entered by the recipient", () => {
  const result = prefill.applyResumeSuggestions({
    currentValues: {
      name: "Recipient edit",
      email: "",
    },
    suggestions: {
      name: "Resume name",
      email: "resume@example.com",
    },
    protectedFieldIds: ["name"],
  });
  assert.deepEqual(result, {
    name: "Recipient edit",
    email: "resume@example.com",
  });
});

test("an explicit field replacement can overwrite after confirmation", () => {
  const result = prefill.applyResumeSuggestions({
    currentValues: { name: "Recipient edit" },
    suggestions: { name: "Resume name", email: "resume@example.com" },
    fieldIds: ["name"],
    overwrite: true,
  });
  assert.deepEqual(result, { name: "Resume name" });
});


test("template defaults are replaced when the recipient has not edited them", () => {
  const result = prefill.applyResumeSuggestions({
    currentValues: { title: "Template default" },
    suggestions: { title: "Resume title" },
    protectedFieldIds: [],
  });
  assert.deepEqual(result, { title: "Resume title" });
});
