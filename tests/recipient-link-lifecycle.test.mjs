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

after(async () => {
  await vite.close();
});

const lifecycle = await vite.ssrLoadModule(
  "/features/templates/recipient-link-lifecycle.ts",
);

const now = new Date("2026-09-07T12:00:00.000Z");

test("active link remains available before its limit and expiry", () => {
  const result = lifecycle.recipientLinkAvailability(
    {
      status: "active",
      expiresAt: "2026-09-08T12:00:00.000Z",
      maxSubmissions: 2,
      submissionCount: 1,
    },
    now,
  );
  assert.equal(result.available, true);
  assert.equal(result.state, "active");
});

test("revoked, expired, and completed links are unavailable", () => {
  assert.equal(
    lifecycle.recipientLinkAvailability(
      { status: "revoked", expiresAt: null, maxSubmissions: 1, submissionCount: 0 },
      now,
    ).state,
    "revoked",
  );
  assert.equal(
    lifecycle.recipientLinkAvailability(
      { status: "active", expiresAt: now.toISOString(), maxSubmissions: 1, submissionCount: 0 },
      now,
    ).state,
    "expired",
  );
  assert.equal(
    lifecycle.recipientLinkAvailability(
      { status: "expired", expiresAt: null, maxSubmissions: 1, submissionCount: 0 },
      now,
    ).state,
    "expired",
  );
  assert.equal(
    lifecycle.recipientLinkAvailability(
      { status: "active", expiresAt: null, maxSubmissions: 1, submissionCount: 1 },
      now,
    ).state,
    "completed",
  );
});

test("link settings stay inside safe bounds", () => {
  assert.equal(lifecycle.parseMaxSubmissions(undefined), 1);
  assert.equal(lifecycle.parseMaxSubmissions(100), 100);
  assert.equal(lifecycle.parseMaxSubmissions(0), undefined);
  assert.equal(lifecycle.parseMaxSubmissions(101), undefined);
  assert.equal(lifecycle.parseLinkExpiration(null, now), null);
  assert.equal(
    lifecycle.parseLinkExpiration("2026-09-08T12:00:00.000Z", now),
    "2026-09-08T12:00:00.000Z",
  );
  assert.equal(
    lifecycle.parseLinkExpiration("2028-09-08T12:00:00.000Z", now),
    undefined,
  );
});

test("idempotency keys use a bounded URL-safe format", () => {
  assert.equal(lifecycle.validIdempotencyKey("12345678-1234-1234-1234-123456789012"), true);
  assert.equal(lifecycle.validIdempotencyKey("short"), false);
  assert.equal(lifecycle.validIdempotencyKey("not allowed spaces"), false);
});
