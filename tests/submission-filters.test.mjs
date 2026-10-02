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

const filters = await vite.ssrLoadModule(
  "/features/templates/submission-filters.ts",
);

test("normalizes filter timestamps to UTC and trims text", () => {
  const params = new URLSearchParams({
    templateId: " template-1 ",
    roleId: "role-1",
    search: "  person@example.com  ",
    from: "2026-09-01T00:00:00+07:00",
    to: "2026-09-10T00:00:00+07:00",
  });
  assert.deepEqual(filters.parseSubmissionFilters(params), {
    filters: {
      templateId: "template-1",
      roleId: "role-1",
      search: "person@example.com",
      from: "2026-08-31T17:00:00.000Z",
      to: "2026-09-09T17:00:00.000Z",
    },
    error: null,
  });
});

test("rejects invalid and reversed filter dates", () => {
  assert.equal(
    filters.parseSubmissionFilters(new URLSearchParams({ from: "bad" })).error,
    "The start date is invalid.",
  );
  assert.equal(
    filters.parseSubmissionFilters(new URLSearchParams({
      from: "2026-09-10T00:00:00Z",
      to: "2026-09-09T00:00:00Z",
    })).error,
    "The end date must be after the start date.",
  );
});
