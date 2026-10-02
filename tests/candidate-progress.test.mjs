import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticStage,
  transitionRequirement,
} from "../features/candidate-progress/progress.ts";
const facts = {
  verified: true,
  preparationCurrent: true,
  runStatus: "completed",
  assigned: 2,
  required: 2,
  completed: 0,
  invitationRequired: true,
  invitationSent: true,
};
test("completed preparation and sent invitation do not claim the candidate has submitted forms", () => {
  assert.equal(automaticStage(facts), "awaiting_forms");
  assert.equal(transitionRequirement(facts, "ready").kind, "forms");
  assert.equal(automaticStage({ ...facts, completed: 1 }), "awaiting_forms");
  assert.equal(automaticStage({ ...facts, completed: 2 }), "ready");
});
test("changed CV and missing delivery cannot inherit completed preparation readiness", () => {
  assert.equal(
    automaticStage({ ...facts, completed: 2, preparationCurrent: false }),
    "approved",
  );
  assert(
    transitionRequirement(
      { ...facts, preparationCurrent: false },
      "awaiting_forms",
    ),
  );
  assert.equal(
    automaticStage({ ...facts, completed: 2, invitationSent: false }),
    "approved",
  );
  assert.equal(
    automaticStage({ ...facts, completed: 2, runStatus: "failed" }),
    "approved",
  );
});
test("review stages do not need AI, while approval requires actual CV verification", () => {
  assert.equal(
    transitionRequirement({ ...facts, verified: false }, "reviewing"),
    null,
  );
  assert.equal(
    transitionRequirement({ ...facts, verified: false }, "approved").kind,
    "review",
  );
  assert.equal(
    automaticStage({
      ...facts,
      verified: false,
      preparationCurrent: false,
      runStatus: "waiting_review",
    }),
    "reviewing",
  );
});
