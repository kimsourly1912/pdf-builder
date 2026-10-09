import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});
after(() => vite.close());
const { interviewDetailGuidance: guidance } = await vite.ssrLoadModule(
  "/features/interviews/detail-guidance.ts",
);
const base = {
  outcome: null,
  hold: null,
  rounds: [],
  roundsComplete: false,
  stage: "ready",
};
const round = {
  id: "round-1",
  name: "HR interview",
  status: "scheduled",
  interviewers: ["Sokha", "Dara"],
  feedback: [],
  appointment: { startsAt: "2030-01-03T03:00:00.000Z" },
};
test("appointment guidance enables attendance only at the start time", () => {
  const p = { ...base, stage: "scheduled", rounds: [round] };
  assert.equal(
    guidance(p, Date.parse(round.appointment.startsAt) - 1).action,
    "view_rounds",
  );
  const next = guidance(p, Date.parse(round.appointment.startsAt));
  assert.equal(next.action, "complete");
  assert.equal(next.round.id, round.id);
  assert.equal(
    p.rounds[0].status,
    "scheduled",
    "time does not change lifecycle state",
  );
});
test("draft feedback remains outstanding and points to the correct interviewer", () => {
  const r = {
    ...round,
    status: "completed",
    feedback: [
      { interviewer: "Sokha", status: "submitted" },
      { interviewer: "Dara", status: "draft" },
    ],
  };
  const next = guidance({ ...base, stage: "feedback", rounds: [r] });
  assert.equal(next.action, "feedback");
  assert.equal(next.interviewer, "Dara");
  assert.match(next.description, /Drafts do not count/);
});
test("fully assessed rounds offer final review rather than forcing another round", () => {
  const r = {
    ...round,
    status: "completed",
    feedback: round.interviewers.map((interviewer) => ({
      interviewer,
      status: "submitted",
    })),
  };
  const p = { ...base, rounds: [r] };
  assert.equal(guidance(p).action, "finish_rounds");
  assert.equal(
    guidance({ ...p, roundsComplete: true, stage: "decision" }).action,
    "decide",
  );
});
test("hold and closed outcomes take precedence over round actions", () => {
  const p = {
    ...base,
    rounds: [round],
    hold: { reason: "Waiting for candidate" },
  };
  assert.equal(guidance(p).action, "resume");
  assert.equal(
    guidance({ ...p, outcome: "withdrawn" }).action,
    "view_decision",
  );
});
test("cancelled and no-show appointments allow a new round without declaring rejection", () => {
  for (const status of ["cancelled", "no_show"]) {
    const p = { ...base, rounds: [{ ...round, status }] };
    assert.equal(guidance(p).action, "schedule");
    assert.equal(p.outcome, null);
  }
  assert.equal(guidance(base).label, "Schedule first interview");
});

test("lint rejects native application pickers while retaining the PDF overlay exception", async () => {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: root });
  const controls = [
    "<select />",
    '<Input type="datetime-local" />',
    '<input type="date" />',
    '<Input type="time" />',
    "<datalist />",
  ];
  for (const control of controls) {
    const results = await eslint.lintText(
      `export function Example() { return ${control}; }`,
      { filePath: root + "/features/interviews/example.tsx" },
    );
    assert(
      results[0].messages.some(
        (message) => message.ruleId === "no-restricted-syntax",
      ),
      control,
    );
  }
  const allowed = await eslint.lintText(
    'export function Example() { return <input type="date" />; }',
    { filePath: root + "/features/templates/recipient-fill.tsx" },
  );
  assert(
    !allowed[0].messages.some(
      (message) => message.ruleId === "no-restricted-syntax",
    ),
  );
  const forbidden = await eslint.lintText(
    "export function Example() { return <select />; }",
    { filePath: root + "/features/templates/recipient-fill.tsx" },
  );
  assert(
    forbidden[0].messages.some(
      (message) => message.ruleId === "no-restricted-syntax",
    ),
    "PDF exceptions must still reject native dropdowns",
  );
});
