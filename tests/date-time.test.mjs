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

const dateTime = await vite.ssrLoadModule(
  "/features/templates/date-time.ts",
);

test("treats legacy SQLite timestamps without an offset as UTC", () => {
  assert.equal(
    dateTime.toUtcIsoString("2026-09-09 02:15:30"),
    "2026-09-09T02:15:30.000Z",
  );
  assert.equal(
    dateTime.toUtcIsoString("2026-09-09T02:15:30"),
    "2026-09-09T02:15:30.000Z",
  );
});

test("formats UTC timestamps in an explicit user timezone", () => {
  assert.equal(
    dateTime.formatLocalDateTime("2026-09-09T02:15:30.000Z", {
      locale: "en-US",
      timeZone: "Asia/Phnom_Penh",
      includeTimeZone: false,
    }),
    "Sep 9, 2026, 09:15 AM",
  );
});

test("rejects invalid timezones and preserves UTC as the safe fallback", () => {
  assert.equal(dateTime.normalizeTimeZone("Asia/Phnom_Penh"), "Asia/Phnom_Penh");
  assert.equal(dateTime.normalizeTimeZone("not/a-zone"), "UTC");
});
