import assert from "node:assert/strict";
import test from "node:test";
import { candidateNextAction } from "../features/candidate-progress/submission-progress.ts";
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
test("next action opens the selected CV, contact confirmation or active preparation directly", () => {
  const item = {
    id: "candidate-1",
    selectedCv: { id: "cv-2", intakeId: "intake-2" },
    facts: { ...facts, verified: false },
    contactConfirmed: false,
    attention: [],
    run: null,
  };
  assert.equal(candidateNextAction(item).href, "/resumes/cv-2");
  item.facts = { ...facts, preparationCurrent: false };
  assert.equal(candidateNextAction(item).href, "/intake/intake-2#contact");
  item.contactConfirmed = true;
  assert.equal(candidateNextAction(item).href, "/intake/intake-2#preparation");
  item.run = { id: "run-1", workflowId: "workflow-1", status: "failed" };
  assert.deepEqual(candidateNextAction(item), {
    next: "Resolve issue",
    href: "/workflows/workflow-1?tab=runs&run=run-1",
  });
  item.run.status = "running";
  assert.equal(candidateNextAction(item).next, "View progress");
  // New, unapproved CVs still require review despite an older preparation run.
  item.facts.verified = false;
  assert.equal(candidateNextAction(item).href, "/resumes/cv-2");
});
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
