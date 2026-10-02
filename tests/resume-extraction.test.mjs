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

const extraction = await vite.ssrLoadModule("/features/resumes/resume-extraction.ts");

test("extracts common resume identity and section values without guessing", () => {
  const result = extraction.extractResumeProfile([
    {
      pageNumber: 1,
      text: `Sokha Chan
Backend Developer
Email: sokha@example.com
Phone: +855 12 345 678
Address: Phnom Penh, Cambodia
Skills
TypeScript, Node.js, Cloudflare Workers
Languages
Khmer, English`,
    },
  ]);

  assert.equal(result.fields.fullName.value, "Sokha Chan");
  assert.deepEqual(result.fields.emails.value, ["sokha@example.com"]);
  assert.deepEqual(result.fields.phones.value, ["+855 12 345 678"]);
  assert.deepEqual(result.fields.skills.value, ["TypeScript", "Node.js", "Cloudflare Workers"]);
  assert.equal(result.fields.gender.value, null);
  assert.equal(result.fields.nationality.value, null);
});

test("marks pages without selectable text for manual attention", () => {
  const result = extraction.extractResumeProfile([
    { pageNumber: 1, text: "" },
    { pageNumber: 2, text: "Jane Doe\njane@example.com" },
  ]);
  assert.equal(result.scannedPageCount, 1);
  assert.equal(result.pageCount, 2);
});

test("normalizes email and phone for duplicate detection", () => {
  assert.equal(extraction.normalizeEmail("  TEST@Example.COM "), "test@example.com");
  assert.equal(extraction.normalizePhone("+855 (12) 345-678"), "+85512345678");
});

