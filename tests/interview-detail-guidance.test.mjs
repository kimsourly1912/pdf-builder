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

test("AM/PM entry preserves midnight, noon, and afternoon appointment hours", async () => {
  const { hour12, hour24, appointmentLabels } = await vite.ssrLoadModule(
    "/features/interviews/appointment-presentation.ts",
  );
  for (const [stored, shown, period] of [
    ["00", "12", "AM"],
    ["12", "12", "PM"],
    ["15", "3", "PM"],
    ["01", "1", "AM"],
    ["23", "11", "PM"],
  ]) {
    assert.equal(hour12(stored), shown);
    assert.equal(hour24(shown, period), stored);
  }
  assert.equal(hour12(""), "");
  const a = {
    startsAt: "2026-10-09T08:10:00.000Z",
    timezone: "Asia/Phnom_Penh",
  };
  assert.equal(appointmentLabels(a).time, "3:10 PM");
  assert.equal(appointmentLabels(a).offset, "GMT+7");
  assert.equal(
    appointmentLabels({ ...a, startsAt: "2026-10-08T17:00:00.000Z" }).time,
    "12:00 AM",
  );
});

test("final review readiness requires attendance, submitted feedback and no scheduled appointment", async () => {
  const { finalReviewReadiness: ready } = await vite.ssrLoadModule(
    "/features/interviews/final-review.ts",
  );
  assert.equal(ready(base).ready, false);
  const completed = {
    ...round,
    status: "completed",
    feedback: [
      { interviewer: "Sokha", status: "submitted" },
      { interviewer: "Dara", status: "draft" },
    ],
  };
  const waiting = ready({ ...base, rounds: [completed] });
  assert.equal(waiting.submitted, 1);
  assert.equal(waiting.required, 2);
  assert.equal(waiting.outstanding[0].interviewer, "Dara");
  assert.equal(waiting.ready, false);
  const assessed = {
    ...completed,
    feedback: completed.feedback.map((item) => ({
      ...item,
      status: "submitted",
    })),
  };
  const process = { ...base, rounds: [assessed] };
  assert.equal(ready(process).ready, true);
  assert.equal(ready({ ...process, rounds: [assessed, round] }).ready, false);
  assert.equal(
    ready({ ...process, hold: { reason: "Budget pause" } }).ready,
    false,
  );
  assert.equal(ready({ ...process, outcome: "passed" }).ready, false);
  assert.equal(
    ready({ ...process, rounds: [{ ...round, status: "no_show" }] }).ready,
    false,
  );
});

test("work queues distinguish due attendance, drafts, paused follow-ups and final review", async () => {
  const {
    interviewWork: work,
    matchesInterviewFilter: matches,
    followUpToday,
  } = await vite.ssrLoadModule("/features/interviews/flow-presentation.ts");
  const now = Date.parse("2030-01-02T18:00:00Z");
  assert.equal(followUpToday(now), "2030-01-03");
  const scheduled = { ...base, rounds: [round] };
  assert.equal(work(scheduled, now).upcoming, true);
  assert.equal(work(scheduled, now).attendanceDue, false);
  assert.equal(matches(scheduled, "attention", now), false);
  assert.equal(
    work(scheduled, Date.parse(round.appointment.startsAt)).attendanceDue,
    true,
  );
  const completed = {
    ...round,
    status: "completed",
    feedback: [
      { interviewer: "Sokha", status: "submitted" },
      { interviewer: "Dara", status: "draft" },
    ],
  };
  const p = { ...base, rounds: [completed] };
  assert.equal(work(p, now).missing, 1);
  assert.equal(matches(p, "missing_feedback", now), true);
  const paused = { ...p, hold: { followUp: "2030-01-03" } };
  assert.equal(work(paused, now).followUpDue, true);
  assert.equal(matches(paused, "missing_feedback", now), false);
  assert.equal(matches(paused, "attention", now), true);
  assert.equal(
    matches({ ...paused, hold: { followUp: "2030-01-04" } }, "attention", now),
    false,
  );
  completed.feedback[1].status = "submitted";
  assert.equal(matches(p, "final_review", now), true);
  for (const filter of [
    "attention",
    "upcoming",
    "final_review",
    "missing_feedback",
    "follow_up",
    "hold",
  ])
    assert.equal(
      matches({ ...paused, outcome: "withdrawn" }, filter, now),
      false,
    );
});
test("status age follows actual lifecycle changes and ignores draft or partial feedback updates", async () => {
  const { interviewStageSince: since } = await vite.ssrLoadModule(
    "/features/interviews/flow-presentation.ts",
  );
  const events = [
    {
      action: "schedule",
      at: "2030-01-01T01:00:00Z",
      roundId: "r",
      interviewers: ["Sokha", "Dara"],
    },
    { action: "complete", at: "2030-01-02T01:00:00Z", roundId: "r" },
    {
      action: "feedback",
      at: "2030-01-02T02:00:00Z",
      roundId: "r",
      interviewer: "Sokha",
      status: "submitted",
    },
    {
      action: "feedback",
      at: "2030-01-02T03:00:00Z",
      roundId: "r",
      interviewer: "Dara",
      status: "draft",
    },
  ];
  assert.equal(since(events, "2030-01-01T00:00:00Z"), events[1].at);
  events.push({
    action: "feedback",
    at: "2030-01-02T04:00:00Z",
    roundId: "r",
    interviewer: "Dara",
    status: "submitted",
  });
  assert.equal(since(events, "2030-01-01T00:00:00Z"), events.at(-1).at);
  for (const event of [
    { action: "finish_rounds" },
    { action: "hold" },
    { action: "resume" },
    { action: "decide", outcome: "passed" },
    { action: "reopen" },
  ]) {
    events.push({ ...event, at: `2030-01-03T0${events.length - 4}:00:00Z` });
    assert.equal(since(events, "2030-01-01T00:00:00Z"), events.at(-1).at);
  }
});
test("candidate messages include appointment context without internal preparation or feedback", async () => {
  const { appointmentMessage } = await vite.ssrLoadModule(
    "/features/interviews/communication.ts",
  );
  const message = appointmentMessage(
    {
      snapshot: { name: "TEST Candidate" },
      position: "HR officer",
      responsible: "hr@example.test",
    },
    {
      ...round,
      appointment: {
        startsAt: "2026-10-09T08:10:00Z",
        timezone: "Asia/Phnom_Penh",
        duration: 60,
        kind: "online",
        location: "https://meet.example.test/room",
        notes: "PRIVATE internal assessment",
      },
    },
  );
  assert.match(message, /3:10 PM/);
  assert.match(message, /GMT\+7/);
  assert.match(message, /https:\/\/meet.example.test\/room/);
  assert.match(message, /hr@example.test/);
  assert(!message.includes("PRIVATE"));
  assert(!message.includes("Sokha"));
  assert.match(message, /reply to confirm/);
});
test("preparation comparison distinguishes newer CVs and changed accepted form versions", async () => {
  const { preparationChanges: changes } = await vite.ssrLoadModule(
    "/features/interviews/preparation-context.ts",
  );
  const snapshot = {
    cv: { id: "cv" },
    runId: "run",
    forms: [{ id: "form", versionNumber: 1 }],
  };
  const current = {
    selectedCv: { id: "cv" },
    currentCv: { id: "cv" },
    run: { id: "run" },
    forms: [
      {
        id: "form",
        versionNumber: 1,
        reviewStatus: "accepted",
        isRequired: true,
      },
    ],
    facts: { preparationCurrent: true },
  };
  assert.deepEqual(changes(snapshot, current), []);
  assert.match(
    changes(snapshot, { ...current, currentCv: { id: "new-cv" } }).join(" "),
    /newer CV/,
  );
  assert.match(
    changes(snapshot, { ...current, selectedCv: { id: "new-cv" } }).join(" "),
    /selected CV/,
  );
  assert.match(
    changes(snapshot, {
      ...current,
      forms: [{ ...current.forms[0], versionNumber: 2 }],
    }).join(" "),
    /versions/,
  );
  assert.match(
    changes(snapshot, {
      ...current,
      forms: [{ ...current.forms[0], reviewStatus: "corrections_requested" }],
    }).join(" "),
    /awaiting acceptance/,
  );
});
