import assert from "node:assert/strict";
import test from "node:test";
import { stageSince } from "../features/candidate-progress/stage-since.ts";
import { stageAge, candidateCvPreview } from "../features/candidate-progress/presentation.ts";
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
test("stage waiting uses receipt, approval, completion or HR move evidence, never general activity", () => {
  const evidence = {
    receivedAt: "2026-09-01T00:00:00Z",
    approvedAt: "2026-09-02T00:00:00Z",
    approvalCurrent: true,
    cvChangedAt: "2026-09-02T00:00:00Z",
    candidateChangedAt: "2026-09-02T00:00:00Z",
    preparationCompletedAt: "2026-09-03T00:00:00Z",
    formCompletedAt: ["2026-09-05T00:00:00Z"],
  };
  assert.equal(stageSince("new", evidence), evidence.receivedAt);
  assert.equal(stageSince("approved", evidence), evidence.approvedAt);
  assert.equal(
    stageSince("awaiting_forms", evidence),
    evidence.preparationCompletedAt,
  );
  assert.equal(stageSince("ready", evidence), evidence.formCompletedAt[0]);
  assert.equal(stageSince("reviewing", evidence), null);
  assert.equal(
    stageSince("reviewing", {
      ...evidence,
      reviewStartedAt: "2026-09-04T00:00:00Z",
    }),
    "2026-09-04T00:00:00Z",
  );
  assert.equal(
    stageSince("reviewing", { ...evidence, manualAt: "2026-09-04T00:00:00Z" }),
    "2026-09-04T00:00:00Z",
  );
  assert.equal(
    stageSince("new", {
      ...evidence,
      approvalCurrent: false,
      cvChangedAt: "2026-09-06T00:00:00Z",
    }),
    "2026-09-06T00:00:00Z",
  );
  assert.equal(
    stageAge(
      "awaiting_forms",
      evidence.preparationCompletedAt,
      Date.parse("2026-09-06T00:00:00Z"),
    ),
    "Awaiting forms for 3 days",
  );
  assert.match(stageAge("reviewing", null), /start time unknown/);
});
test("next action opens the selected CV, contact confirmation or active preparation directly", () => {
  const item = {
    id: "candidate-1",
    selectedCv: { id: "cv-2", intakeId: "intake-2" },
    facts: { ...facts, verified: false },
    contactConfirmed: false,
    attention: [],
    run: null,
  };
  assert.equal(candidateNextAction(item).href, "/candidates/candidate-1?tab=documents");
  item.facts = { ...facts, preparationCurrent: false };
  assert.equal(candidateNextAction(item).href, "/candidates/candidate-1?tab=communication");
  item.contactConfirmed = true;
  assert.equal(candidateNextAction(item).href, "/candidates/candidate-1?tab=overview");
  item.run = { id: "run-1", workflowId: "workflow-1", status: "failed" };
  assert.deepEqual(candidateNextAction(item), {
    next: "Resolve issue",
    href: "/workflows/workflow-1?tab=runs&run=run-1",
  });
  item.run.status = "running";
  assert.equal(candidateNextAction(item).next, "View progress");
  // New, unapproved CVs still require review despite an older preparation run.
  item.facts.verified = false;
  assert.equal(candidateNextAction(item).href, "/candidates/candidate-1?tab=documents");
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

test("document acceptance requires HR decisions and cannot be created by Kanban moves",()=>{
 const f={...facts,completed:2,accepted:1};
 assert.equal(automaticStage(f),'ready');
 assert.match(transitionRequirement(f,'accepted').message,/accept every required/);
 assert.equal(automaticStage({...f,accepted:2}),'accepted');
 assert.equal(transitionRequirement({...f,accepted:2},'ready'),null);
});

test("correction requests start a new waiting clock while preserving preparation history",()=>{
 assert.equal(stageSince('awaiting_forms',{receivedAt:'2026-10-01',approvedAt:'2026-10-01',approvalCurrent:true,cvChangedAt:'2026-10-01',candidateChangedAt:'2026-10-01',preparationCompletedAt:'2026-10-01',formCompletedAt:[],formCorrectionAt:['2026-10-03']}),'2026-10-03');
});

test("CV navigation previews only active CVs in the candidate projection and never changes preparation selection", () => {
  const selected = {id:"current",archived:false,fileName:"current.pdf"};
  const older = {id:"older",archived:false,fileName:"older.pdf"};
  const item = {selectedCv:selected,cvs:[selected,older,{id:"archived",archived:true}],facts:{verified:true}};
  assert.equal(candidateCvPreview(item,"older"),older);
  assert.equal(candidateCvPreview(item,"foreign"),selected);
  assert.equal(candidateCvPreview(item,"archived"),selected);
  assert.equal(candidateCvPreview(item,null),selected);
  assert.equal(item.selectedCv,selected);assert.equal(item.facts.verified,true);
});
