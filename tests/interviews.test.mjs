import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import {
  seedAcceptedPreparation,
  insertFixture,
} from "./helpers/interview-fixture.mjs";
const root = fileURLToPath(new URL("..", import.meta.url));
const runtime = {
  DB: null,
  FILES: { async delete() {} },
  MANAGEMENT_EMAIL: "a@owner.test",
  TEST_DATA_RESET_ENABLED: "true",
  ENVIRONMENT: "development",
  AUTH_BOOTSTRAP_TOKEN: "test-interview-bootstrap",
  BETTER_AUTH_URL: "http://localhost:5173",
  BETTER_AUTH_SECRET: "local-interview-test-secret-only-32-characters",
};
globalThis.__telegramTestEnv = runtime;
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: {
    alias: {
      "@": root,
      "server-only": root + "/tests/helpers/server-only.mjs",
      "cloudflare:workers": root + "/tests/helpers/cloud-runtime.mjs",
    },
  },
  server: { middlewareMode: true },
});
const service = await vite.ssrLoadModule(
  "/features/interviews/interviews.server.ts",
);
const preparation = await vite.ssrLoadModule(
  "/features/candidate-progress/progress.server.ts",
);
const validation = await vite.ssrLoadModule(
  "/features/interviews/validation.server.ts",
);
const archive = await vite.ssrLoadModule("/features/archive/archive.server.ts");
const reset = await vite.ssrLoadModule("/features/test-data/reset.server.ts");
after(async () => {
  runtime.DB?.close();
  await vite.close();
});
function fixture(t) {
  runtime.DB?.close();
  runtime.DB = sqliteD1();
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2030, 0, 2) });
  return {
    ...seedAcceptedPreparation(runtime.DB.sqlite),
    db: runtime.DB.sqlite,
  };
}
async function rejectStatus(promise, status, text) {
  await assert.rejects(
    promise,
    (asyncError) =>
      asyncError instanceof Response && asyncError.status === status,
  );
  if (text) {
    try {
      await promise;
    } catch (e) {
      assert.match(await e.text(), text);
    }
  }
}
async function start(f, extra = {}) {
  const c = await preparation.detailProgress(f.owner, f.candidateId);
  return (
    await service.handoffInterview(f.owner, f.candidateId, {
      position: "Software Engineer",
      expectedRevision: c.revision,
      mutationId: crypto.randomUUID(),
      ...extra,
    })
  ).process;
}
async function mutate(f, p, values) {
  return (
    await service.mutateInterview(f.owner, p.id, {
      ...values,
      expectedVersion: p.version,
      mutationId: crypto.randomUUID(),
    })
  ).process;
}
const appointment = {
  localDateTime: "2030-01-03T10:00",
  timezone: "Asia/Phnom_Penh",
  duration: 60,
  kind: "online",
  location: "https://meet.example.test/room",
  notes: "Discuss job-related skills",
};
const scorecard = {
  ratings: [5, null, 3, 4],
  notes: "Role examples discussed",
  strengths: "Relevant skill evidence",
  concerns: "Needs additional role experience",
  recommendation: "another_interview",
};
async function scheduled(f, p, interviewers = ["Sokha", "Dara"]) {
  return mutate(f, p, {
    action: "schedule",
    name: "HR interview",
    interviewers,
    appointment,
  });
}
async function completed(t, f, p) {
  t.mock.timers.setTime(Date.UTC(2030, 0, 3, 4));
  return mutate(f, p, { action: "complete", roundId: p.rounds.at(-1).id });
}
async function assessed(f, p) {
  for (const interviewer of p.rounds.at(-1).interviewers)
    p = await mutate(f, p, {
      action: "feedback",
      roundId: p.rounds.at(-1).id,
      interviewer,
      status: "submitted",
      scorecard,
    });
  return p;
}
test("handoff needs real accepted evidence, owner scope, current revisions, and never enrols on reads", async (t) => {
  const f = fixture(t);
  seedAcceptedPreparation(f.db, "b");
  assert.equal(
    (await service.listInterviews(f.owner, new URLSearchParams())).total,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_processes").get().n,
    0,
  );
  await rejectStatus(start({ ...f, owner: "b@owner.test" }), 404);
  f.db.exec(
    "UPDATE submission_reviews SET status='corrections_requested',revision='2' WHERE submission_id='asubmission'",
  );
  await rejectStatus(start(f), 422);
  f.db.exec(
    "UPDATE submission_reviews SET status='accepted',revision='3' WHERE submission_id='asubmission'",
  );
  await rejectStatus(start(f, { expectedRevision: "stale" }), 409);
  const p = await start(f);
  assert.equal(p.stage, "ready");
  assert.equal(p.createdBy, f.owner);
  assert.equal(p.snapshot.cv.id, f.resumeId);
  assert.equal(p.snapshot.forms[0].reviewStatus, "accepted");
  assert.equal(
    (await preparation.detailProgress(f.owner, f.candidateId)).interview.id,
    p.id,
  );
  await rejectStatus(service.detailInterview("b@owner.test", p.id), 404);
  await rejectStatus(
    service.mutateInterview("b@owner.test", p.id, {
      action: "hold",
      reason: "Role review pending",
      mutationId: "cross",
      expectedVersion: 1,
    }),
    404,
  );
  assert.equal(
    (await service.listInterviews("b@owner.test", new URLSearchParams())).total,
    0,
  );
});
test("handoff checks current approval even when documents remain accepted", async (t) => {
  const f = fixture(t);
  f.db.exec(
    "UPDATE resumes SET verification_status='unverified',updated_at='2030-01-02' WHERE id='aresume'",
  );
  await rejectStatus(start(f), 422);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_processes").get().n,
    0,
  );
});
test("repeated and competing handoffs retain one process and one atomic history event", async (t) => {
  const f = fixture(t),
    c = await preparation.detailProgress(f.owner, f.candidateId),
    body = {
      position: "Engineer",
      expectedRevision: c.revision,
      mutationId: "handoff-a",
    };
  // Queue the batches as D1 does, while both calls read before either commit.
  const real = runtime.DB.batch.bind(runtime.DB);
  let queue = Promise.resolve();
  runtime.DB.batch = (statements) => {
    const result = queue.then(() => real(statements));
    queue = result.catch(() => {});
    return result;
  };
  const [a, b] = await Promise.all([
    service.handoffInterview(f.owner, f.candidateId, body),
    service.handoffInterview(f.owner, f.candidateId, {
      ...body,
      mutationId: "handoff-b",
    }),
  ]);
  assert.equal(a.process.id, b.process.id);
  const repeat = await service.handoffInterview(f.owner, f.candidateId, {
    ...body,
    expectedRevision: "old",
    position: "Different",
  });
  assert.equal(repeat.process.position, "Engineer");
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_processes").get().n,
    1,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_events").get().n,
    1,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM audit_events WHERE action='candidate.interview_started'",
      )
      .get().n,
    1,
  );
});
test("concurrent acceptance revision and new assignment changes abort handoff with no partial records", async (t) => {
  const f = fixture(t),
    real = runtime.DB.batch.bind(runtime.DB);
  runtime.DB.batch = async (statements) => {
    f.db.exec(
      "UPDATE submission_reviews SET revision='changed' WHERE submission_id='asubmission'",
    );
    return real(statements);
  };
  await rejectStatus(start(f), 409);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_processes").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_events").get().n,
    0,
  );
  runtime.DB.batch = async (statements) => {
    f.db.exec(
      "UPDATE form_assignments SET status='assigned' WHERE id='aassignment'",
    );
    return real(statements);
  };
  await rejectStatus(start(f), 409);
});
test("schedule/reschedule/cancel retain details, idempotency receipts and stale updates preserve atomic history", async (t) => {
  const f = fixture(t);
  let p = await start(f);
  const old = p;
  const body = {
    action: "schedule",
    name: "HR interview",
    interviewers: ["Sokha"],
    appointment,
    expectedVersion: p.version,
    mutationId: "schedule-once",
  };
  p = (await service.mutateInterview(f.owner, p.id, body)).process;
  assert.equal(p.stage, "scheduled");
  assert.equal(p.rounds[0].appointment.startsAt, "2030-01-03T03:00:00.000Z");
  const retry = await service.mutateInterview(f.owner, p.id, body);
  assert.equal(retry.reused, true);
  assert.equal(retry.process.version, p.version);
  await rejectStatus(
    service.mutateInterview(f.owner, p.id, { ...body, name: "Changed" }),
    409,
  );
  await rejectStatus(
    mutate(f, old, {
      action: "withdraw",
      reason: "Candidate withdrew application",
    }),
    409,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_events").get().n,
    2,
  );
  p = await mutate(f, p, {
    action: "reschedule",
    roundId: p.rounds[0].id,
    appointment: { ...appointment, localDateTime: "2030-01-04T12:30" },
    reason: "Interviewer unavailable that morning",
  });
  assert.equal(
    p.activity[0].details.previousAppointment.startsAt,
    "2030-01-03T03:00:00.000Z",
  );
  p = await mutate(f, p, {
    action: "cancel",
    roundId: p.rounds[0].id,
    reason: "Candidate requested postponement",
  });
  assert.equal(p.stage, "ready");
  assert.equal(p.rounds[0].status, "cancelled");
  assert.equal(
    p.activity[0].details.previousAppointment.localDateTime,
    "2030-01-04T12:30",
  );
  assert.throws(() => f.db.exec("DELETE FROM interview_events"), /append-only/);
});
test("no-show is attendance only; time passing does not complete an appointment", async (t) => {
  const f = fixture(t);
  let p = await scheduled(f, await start(f));
  await rejectStatus(
    mutate(f, p, {
      action: "no_show",
      roundId: p.rounds[0].id,
      reason: "Candidate did not attend",
    }),
    422,
  );
  t.mock.timers.setTime(Date.UTC(2030, 0, 3, 4));
  assert.equal(
    (await service.detailInterview(f.owner, p.id)).stage,
    "scheduled",
  );
  p = await mutate(f, p, {
    action: "no_show",
    roundId: p.rounds[0].id,
    reason: "Candidate did not attend",
  });
  assert.equal(p.outcome, null);
  assert.equal(p.stage, "ready");
  p = await mutate(f, p, {
    action: "reschedule",
    roundId: p.rounds[0].id,
    reason: "Candidate requested another date",
    appointment: { ...appointment, localDateTime: "2030-01-05T10:00" },
  });
  assert.equal(p.stage, "scheduled");
});
test("multiple rounds require each named evaluation; drafts and unassessed scores never complete review", async (t) => {
  const f = fixture(t);
  let p = await completed(t, f, await scheduled(f, await start(f)));
  const roundId = p.rounds[0].id;
  assert.equal(p.stage, "feedback");
  p = await mutate(f, p, {
    action: "feedback",
    roundId,
    interviewer: "Sokha",
    status: "draft",
    scorecard,
  });
  assert.equal(p.stage, "feedback");
  assert.equal(p.rounds[0].feedback[0].scorecard.ratings[1], null);
  assert.equal(p.rounds[0].feedback[0].enteredBy, f.owner);
  await rejectStatus(mutate(f, p, { action: "finish_rounds" }), 422);
  await rejectStatus(
    mutate(f, p, {
      action: "feedback",
      roundId,
      interviewer: "Unknown",
      status: "submitted",
      scorecard,
    }),
    422,
  );
  p = await assessed(f, p);
  assert.equal(p.stage, "ready");
  assert.equal(p.outcome, null);
  p = await mutate(f, p, {
    action: "schedule",
    name: "Manager interview",
    interviewers: ["Manager"],
    appointment: { ...appointment, localDateTime: "2030-01-06T10:00" },
  });
  assert.equal(p.rounds.length, 2);
  t.mock.timers.setTime(Date.UTC(2030, 0, 6, 4));
  p = await mutate(f, p, { action: "complete", roundId: p.rounds[1].id });
  p = await assessed(f, p);
  p = await mutate(f, p, { action: "finish_rounds" });
  assert.equal(p.stage, "decision");
});
test("invalid transitions and invalid nested identifiers cannot fabricate evidence or leak cross-owner rounds", async (t) => {
  const f = fixture(t);
  let p = await start(f);
  await rejectStatus(mutate(f, p, { action: "move", stage: "decision" }), 422);
  await rejectStatus(mutate(f, p, { action: "finish_rounds" }), 422);
  await rejectStatus(
    mutate(f, p, {
      action: "decide",
      outcome: "passed",
      reason: "Strong relevant job skills",
    }),
    422,
  );
  p = await scheduled(f, p);
  await rejectStatus(
    mutate(f, p, {
      action: "feedback",
      roundId: p.rounds[0].id,
      interviewer: "Sokha",
      status: "submitted",
      scorecard,
    }),
    422,
  );
  const b = { ...seedAcceptedPreparation(f.db, "b"), db: f.db };
  const other = await scheduled(b, await start(b));
  await rejectStatus(
    mutate(f, p, {
      action: "cancel",
      roundId: other.rounds[0].id,
      reason: "Wrong process identifier",
    }),
    404,
  );
});
test("holds retain stage and block ordinary edits; withdrawal, correction and reopening preserve decisions", async (t) => {
  const f = fixture(t);
  let p = await scheduled(f, await start(f));
  p = await mutate(f, p, {
    action: "hold",
    reason: "Position budget under review",
    followUp: "2030-02-01",
  });
  assert.equal(p.hold.previousStage, "scheduled");
  await rejectStatus(
    mutate(f, p, {
      action: "cancel",
      roundId: p.rounds[0].id,
      reason: "Trying while on hold",
    }),
    409,
  );
  p = await mutate(f, p, {
    action: "resume",
    reason: "Position budget confirmed",
  });
  assert.equal(p.stage, "scheduled");
  p = await completed(t, f, p);
  p = await assessed(f, p);
  p = await mutate(f, p, { action: "finish_rounds" });
  await rejectStatus(
    mutate(f, p, { action: "decide", outcome: "passed", reason: "ok" }),
    422,
  );
  p = await mutate(f, p, {
    action: "decide",
    outcome: "passed",
    reason: "Relevant experience meets the role needs",
  });
  assert.equal(p.outcome, "passed");
  assert.equal(p.decidedBy, f.owner);
  assert.equal(p.decidedAt, new Date().toISOString());
  await rejectStatus(
    mutate(f, p, {
      action: "schedule",
      name: "Invalid",
      interviewers: ["Sokha"],
      appointment,
    }),
    409,
  );
  await rejectStatus(
    mutate(f, p, {
      action: "feedback",
      roundId: p.rounds[0].id,
      interviewer: "Sokha",
      status: "draft",
      scorecard,
    }),
    409,
  );
  p = await mutate(f, p, {
    action: "correct_decision",
    outcome: "not_selected",
    reason: "Corrected role-specific requirement assessment",
  });
  assert.equal(p.outcome, "not_selected");
  assert.equal(p.activity[0].details.previousDecision.outcome, "passed");
  p = await mutate(f, p, {
    action: "reopen",
    reason: "Owner requested an additional review",
  });
  assert.equal(p.outcome, null);
  assert.equal(p.stage, "decision");
  p = await mutate(f, p, {
    action: "withdraw",
    reason: "Candidate withdrew their application",
  });
  assert.equal(p.outcome, "withdrawn");
  assert.equal(p.activity[0].details.previousDecision.outcome, null);
  p = await mutate(f, p, {
    action: "reopen",
    reason: "Candidate renewed their application",
  });
  assert.equal(p.outcome, null);
});
test("an atomic mutation guard detects competing edits; failed audit rolls back round and revision", async (t) => {
  const f = fixture(t);
  let p = await start(f);
  const original = runtime.DB.batch.bind(runtime.DB);
  runtime.DB.batch = async (statements) => {
    f.db.exec("UPDATE interview_processes SET version=version+1");
    return original(statements);
  };
  await rejectStatus(scheduled(f, p), 409);
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_rounds").get().n,
    0,
  );
  runtime.DB.batch = original;
  p = await service.detailInterview(f.owner, p.id);
  f.db.exec(
    "CREATE TRIGGER fail_interview_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE 'candidate.interview_%' BEGIN SELECT RAISE(ABORT,'TEST_AUDIT_FAILURE'); END",
  );
  await assert.rejects(scheduled(f, p));
  assert.equal(
    f.db.prepare("SELECT version FROM interview_processes").get().version,
    p.version,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_rounds").get().n,
    0,
  );
  assert.equal(
    f.db.prepare("SELECT count(*) n FROM interview_guards").get().n,
    0,
  );
});
test("later CV/preparation edits never replace context, and archive/delete retain interview references", async (t) => {
  const f = fixture(t),
    p = await start(f);
  f.db.exec(
    "UPDATE resumes SET verification_status='unverified',updated_at='2030-01-03' WHERE id='aresume'; UPDATE candidates SET full_name='Changed candidate name',updated_at='2030-01-03' WHERE id='acandidate'",
  );
  const current = await service.detailInterview(f.owner, p.id);
  assert.deepEqual(current.snapshot, p.snapshot);
  assert.equal(current.stage, "ready");
  assert.match(
    await archive.deletionBlocker(f.owner, "resume", f.resumeId),
    /interview/,
  );
  assert.throws(
    () => f.db.exec("DELETE FROM resumes WHERE id='aresume'"),
    /FOREIGN KEY/,
  );
  assert.throws(
    () => f.db.exec("UPDATE interview_processes SET snapshot_json='{}'"),
    /immutable/,
  );
  insertFixture(f.db, "archive_records", {
    id: "archive-cv",
    owner_email: f.owner,
    entity_type: "resume",
    entity_id: f.resumeId,
    label: "TEST CV",
    group_id: "test",
    prior_state_json: "{}",
    archived_by: f.owner,
  });
  assert.equal((await service.detailInterview(f.owner, p.id)).id, p.id);
  const history = await preparation
    .detailProgress(f.owner, f.candidateId)
    .catch(() => null);
  assert.equal(history, null);
});
test("candidate history includes interview events while keeping preparation acceptance independent", async (t) => {
  const f = fixture(t),
    p = await start(f);
  await mutate(f, p, {
    action: "withdraw",
    reason: "Candidate withdrew their application",
  });
  const c = await preparation.detailProgress(f.owner, f.candidateId);
  assert.equal(c.automaticStage, "accepted");
  assert(c.activity.some((e) => e.action === "Candidate withdrawn"));
  assert.equal(c.interview.outcome, "withdrawn");
});
test("search, active/closed filters, counts and pagination remain owner-scoped", async (t) => {
  const f = fixture(t);
  let p = await start(f, { position: "Quality Manager" });
  assert.equal(
    (
      await service.listInterviews(
        f.owner,
        new URLSearchParams({ search: "quality", filter: "ready" }),
      )
    ).total,
    1,
  );
  assert.equal(
    (
      await service.listInterviews(
        f.owner,
        new URLSearchParams({ search: "missing" }),
      )
    ).total,
    0,
  );
  await mutate(f, p, {
    action: "withdraw",
    reason: "Candidate withdrew their application",
  });
  const closed = await service.listInterviews(
    f.owner,
    new URLSearchParams({ tab: "closed", filter: "withdrawn", page: "999" }),
  );
  assert.equal(closed.closed, 1);
  assert.equal(closed.counts.withdrawn, 1);
  assert.equal(closed.page, 1);
  assert.equal(
    (await service.listInterviews(f.owner, new URLSearchParams())).total,
    0,
  );
});
test("staging forms reset explicitly deletes interview records, retains another owner and permanent history protection", async (t) => {
  const f = fixture(t);
  await scheduled(f, await start(f));
  const b = { ...seedAcceptedPreparation(f.db, "b"), db: f.db };
  const other = await start(b);
  const choice = { scope: "responses", keepDefinitions: true };
  const preview = await reset.previewTestDataReset(f.owner, choice);
  assert(
    preview.counts.some(
      (c) => c.table === "interview_processes" && c.count === 1,
    ),
  );
  assert.deepEqual(preview.blockers, []);
  await reset.executeTestDataReset(
    f.owner,
    choice,
    preview.revision,
    "DELETE TEST DATA",
  );
  assert.equal(
    f.db
      .prepare("SELECT count(*) n FROM interview_processes WHERE owner_email=?")
      .get(f.owner).n,
    0,
  );
  assert.equal((await service.detailInterview(b.owner, other.id)).id, other.id);
  assert.throws(() => f.db.exec("DELETE FROM interview_events"), /append-only/);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
});
test("server validates timezones, DST, ratings, text, identifiers, duration and HTTPS links", async (t) => {
  fixture(t);
  assert.equal(
    validation.localToUtc("2030-01-03T10:00", "Asia/Phnom_Penh"),
    "2030-01-03T03:00:00.000Z",
  );
  assert.equal(
    validation.localToUtc("2030-07-03T10:00", "America/New_York"),
    "2030-07-03T14:00:00.000Z",
  );
  for (const bad of [
    { ...appointment, duration: 0 },
    { ...appointment, duration: NaN },
    { ...appointment, localDateTime: "2030-02-30T10:00" },
    { ...appointment, timezone: "Invalid/Zone" },
    { ...appointment, location: "http://example.test" },
    { ...appointment, location: "https://user:password@example.test" },
  ])
    assert.throws(
      () => validation.parseAppointment(bad),
      (e) => e.status === 422,
    );
  for (const local of ["2030-03-10T02:30", "2030-11-03T01:30"])
    assert.throws(
      () => validation.localToUtc(local, "America/New_York"),
      (e) => e.status === 422,
    );
  for (const ratings of [[0, null, 3, 4], [NaN, null, 3, 4], [1]])
    assert.throws(
      () => validation.parseScorecard({ ...scorecard, ratings }),
      (e) => e.status === 422,
    );
  assert.throws(
    () =>
      validation.parseScorecard({ ...scorecard, recommendation: "toString" }),
    (e) => e.status === 422,
  );
  assert.throws(
    () => validation.identifier("../foreign"),
    (e) => e.status === 422,
  );
  assert.throws(
    () => validation.parseInterviewers(["Sokha", "sokha"]),
    (e) => e.status === 422,
  );
});

test("interview API requires a real owner session, rejects forged identity and scopes linked records", async (t) => {
  const f = fixture(t);
  seedAcceptedPreparation(f.db, "b");
  const collection = await vite.ssrLoadModule("/app/api/interviews/route.ts"),
    detail = await vite.ssrLoadModule("/app/api/interviews/[id]/route.ts"),
    handoff = await vite.ssrLoadModule(
      "/app/api/candidates/[id]/interviews/route.ts",
    );
  const base = "http://localhost:5173";
  assert.equal(
    (
      await collection.GET(
        new Request(base + "/api/interviews", {
          headers: { "x-chatgpt-email": f.owner },
        }),
      )
    ).status,
    401,
  );
  const auth = (await vite.ssrLoadModule("/lib/auth.ts")).getAuth();
  const signup = await auth.handler(
    new Request(base + "/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: base,
        "x-pdf-builder-bootstrap": runtime.AUTH_BOOTSTRAP_TOKEN,
      },
      body: JSON.stringify({
        name: "TEST Interview Owner",
        email: f.owner,
        password: "LocalInterviewTest123!",
      }),
    }),
  );
  assert.equal(signup.status, 200);
  const cookie = signup.headers.get("set-cookie").split(";")[0];
  const req = (path, body, origin = base) =>
    new Request(base + path, {
      method: body ? "POST" : "GET",
      headers: { cookie, origin, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await collection.GET(req("/api/interviews"))).status, 200);
  const c = await preparation.detailProgress(f.owner, f.candidateId),
    body = {
      position: "Engineer",
      expectedRevision: c.revision,
      mutationId: "api-handoff",
    };
  assert.equal(
    (
      await handoff.POST(
        req(
          "/api/candidates/acandidate/interviews",
          body,
          "https://foreign.test",
        ),
        { params: Promise.resolve({ id: f.candidateId }) },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handoff.POST(req("/api/candidates/bcandidate/interviews", body), {
        params: Promise.resolve({ id: "bcandidate" }),
      })
    ).status,
    404,
  );
  const started = await handoff.POST(
    req("/api/candidates/acandidate/interviews", body),
    { params: Promise.resolve({ id: f.candidateId }) },
  );
  assert.equal(started.status, 200);
  const p = (await started.json()).process;
  const other = await start({
    ...f,
    owner: "b@owner.test",
    candidateId: "bcandidate",
  });
  assert.equal(
    (
      await detail.GET(req("/api/interviews/" + other.id), {
        params: Promise.resolve({ id: other.id }),
      })
    ).status,
    404,
  );
  const mutation = {
    action: "withdraw",
    reason: "Candidate withdrew their application",
    expectedVersion: p.version,
    mutationId: "api-mutation",
  };
  assert.equal(
    (
      await detail.PATCH(
        req("/api/interviews/" + p.id, mutation, "https://foreign.test"),
        { params: Promise.resolve({ id: p.id }) },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await detail.PATCH(req("/api/interviews/" + p.id, mutation), {
        params: Promise.resolve({ id: p.id }),
      })
    ).status,
    200,
  );
});

for (const scope of ["candidates", "all"])
  test(`staging ${scope} reset removes interview dependencies without orphaned records`, async (t) => {
    const f = fixture(t);
    const p = await completed(t, f, await scheduled(f, await start(f)));
    await assessed(f, p);
    const choice = { scope, keepDefinitions: true },
      preview = await reset.previewTestDataReset(f.owner, choice);
    assert.deepEqual(preview.blockers, []);
    await reset.executeTestDataReset(
      f.owner,
      choice,
      preview.revision,
      "DELETE TEST DATA",
    );
    for (const table of [
      "interview_documents",
      "interview_feedback",
      "interview_events",
      "interview_rounds",
      "interview_processes",
    ])
      assert.equal(f.db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  });

test("interview-linked preparation is protected from permanent deletion and eligible automation reset", async (t) => {
  const f = fixture(t),
    graph = {
      nodes: [
        {
          id: "forms",
          kind: "assign_forms",
          config: {
            forms: [
              {
                templateId: f.templateId,
                versionId: f.versionId,
                roleId: "form_user",
              },
            ],
          },
        },
      ],
      edges: [],
    };
  insertFixture(f.db, "workflows", {
    id: "workflow",
    owner_email: f.owner,
    name: "TEST Preparation",
    draft_json: JSON.stringify(graph),
  });
  insertFixture(f.db, "workflow_runs", {
    id: "run",
    workflow_id: "workflow",
    owner_email: f.owner,
    workflow_name: "TEST Preparation",
    version: 1,
    resume_id: f.resumeId,
    graph_json: JSON.stringify(graph),
    context_json: JSON.stringify({ profileVersionId: f.profileId, steps: {} }),
    status: "completed",
    current_node_id: "forms",
  });
  const p = await start(f);
  assert.equal(p.snapshot.runId, "run");
  assert.match(
    await archive.deletionBlocker(f.owner, "workflow_run", "run"),
    /interview/,
  );
  const choice = { scope: "history", keepDefinitions: true },
    preview = await reset.previewTestDataReset(f.owner, choice);
  assert(!preview.counts.some((c) => c.table === "workflow_runs"));
  await reset.executeTestDataReset(
    f.owner,
    choice,
    preview.revision,
    "DELETE TEST DATA",
  );
  assert.equal(
    (await service.detailInterview(f.owner, p.id)).snapshot.runId,
    "run",
  );
  assert.match(
    await archive.deletionBlocker(f.owner, "account", f.userId),
    /interview/,
  );
  assert.throws(
    () => f.db.exec("DELETE FROM form_assignments WHERE id='aassignment'"),
    /FOREIGN KEY/,
  );
});

test("owner handoff rejects a review attributed to another workspace", async (t) => {
  const f = fixture(t);
  f.db.exec(
    "UPDATE submission_reviews SET reviewed_by='other@owner.test' WHERE submission_id='asubmission'",
  );
  await rejectStatus(start(f), 422);
});

test("board pagination returns disjoint owned pages with full matching counts", async (t) => {
  const f = fixture(t);
  await start(f);
  for (let i = 0; i < 26; i++)
    await start({
      ...seedAcceptedPreparation(f.db, `page${i}`, f.owner),
      db: f.db,
    });
  const first = await service.listInterviews(
      f.owner,
      new URLSearchParams({ page: "1" }),
    ),
    second = await service.listInterviews(
      f.owner,
      new URLSearchParams({ page: "2" }),
    );
  assert.equal(first.total, 27);
  assert.equal(first.items.length, 25);
  assert.equal(second.items.length, 2);
  assert.equal(first.counts.ready, 27);
  assert.equal(
    new Set([...first.items, ...second.items].map((p) => p.id)).size,
    27,
  );
  assert.equal(
    (await service.listInterviews("foreign@owner.test", new URLSearchParams()))
      .total,
    0,
  );
});

test("competing scheduling mutations commit one round and its history, rejecting the stale competitor", async (t) => {
  const f = fixture(t),
    p = await start(f),
    real = runtime.DB.batch.bind(runtime.DB);
  let queue = Promise.resolve();
  runtime.DB.batch = (statements) => {
    const result = queue.then(() => real(statements));
    queue = result.catch(() => {});
    return result;
  };
  const outcomes = await Promise.allSettled([
    scheduled(f, p, ["Sokha"]),
    scheduled(f, p, ["Dara"]),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    outcomes.find((r) => r.status === "rejected").reason.status,
    409,
  );
  const current = await service.detailInterview(f.owner, p.id);
  assert.equal(current.rounds.length, 1);
  assert.equal(current.activity.length, 2);
  assert.equal(current.version, 2);
  assert.equal(
    f.db
      .prepare(
        "SELECT count(*) n FROM audit_events WHERE action='candidate.interview_schedule'",
      )
      .get().n,
    1,
  );
});

test("interview account preview returns only the pinned owner-scoped account summary", async (t) => {
  const f = fixture(t),
    p = await start(f);
  const previews = await vite.ssrLoadModule(
    "/features/interviews/account-preview.server.ts",
  );
  const account = await previews.interviewAccountPreview(f.owner, p.id);
  assert.deepEqual(Object.keys(account).sort(), [
    "accountType",
    "blocked",
    "email",
    "mustChangePassword",
    "name",
  ]);
  assert.equal(
    account.email,
    f.db.prepare("SELECT email FROM user WHERE id=?").get(f.userId).email,
  );
  await rejectStatus(
    previews.interviewAccountPreview("foreign@owner.test", p.id),
    404,
  );
  f.db
    .prepare("UPDATE recipient_profiles SET created_by_email=? WHERE user_id=?")
    .run("foreign@owner.test", f.userId);
  await rejectStatus(previews.interviewAccountPreview(f.owner, p.id), 404);
});

test("interview account preview API rejects forged owner headers without a session", async (t) => {
  fixture(t);
  const route = await vite.ssrLoadModule(
    "/app/api/interviews/[id]/account/route.ts",
  );
  const response = await route.GET(
    new Request("http://localhost:5173/api/interviews/unknown/account", {
      headers: { "x-chatgpt-email": "a@owner.test" },
    }),
    { params: Promise.resolve({ id: "unknown" }) },
  );
  assert.equal(response.status, 401);
});
