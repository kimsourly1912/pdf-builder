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

const assignmentStatus = await vite.ssrLoadModule(
  "/features/accounts/assignment-status.ts",
);

test("presents active assignments as pending work", () => {
  assert.deepEqual(assignmentStatus.assignmentDisplay("active"), {
    state: "active",
    label: "Pending",
    detail: "Waiting for submission",
  });
});

test("presents completed assignments as submitted history", () => {
  assert.deepEqual(assignmentStatus.assignmentDisplay("completed"), {
    state: "completed",
    label: "Submitted",
    detail: "Submission completed",
  });
});

test("presents archived and manually revoked assignments as cancelled", () => {
  assert.equal(assignmentStatus.assignmentDisplay("cancelled").state, "cancelled");
  assert.equal(assignmentStatus.assignmentDisplay("revoked").detail, "Cancelled by HR");
});

test("presents other unavailable assignments as expired", () => {
  assert.equal(assignmentStatus.assignmentDisplay("expired").state, "expired");
  assert.equal(assignmentStatus.assignmentDisplay("unknown").label, "Expired");
});
