import "server-only";
import { getDatabaseBinding, type DatabaseStatement } from "@/db";
import { fail } from "@/features/workflows/workflow.server";
import { preparationForInterview } from "@/features/candidate-progress/progress.server";
import { preparationProofSql } from "./preparation-proof.server";
import {
  identifier,
  boundedText,
  reason,
  parseAppointment,
  parseInterviewers,
  parseScorecard,
} from "./validation.server";
import {
  interviewStage,
  missingFeedback,
  OUTCOMES,
  type InterviewProcess,
  type InterviewRound,
  type PreparationSnapshot,
  type InterviewOutcome,
} from "./interviews";
type ProcessRow = {
  id: string;
  owner_email: string;
  candidate_id: string;
  position: string;
  responsible: string;
  snapshot_json: string;
  version: number;
  rounds_complete: number;
  outcome: InterviewOutcome | null;
  decision_reason: string;
  decided_by: string | null;
  decided_at: string | null;
  hold_json: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type RoundRow = {
  id: string;
  process_id: string;
  name: string;
  interviewers_json: string;
  status: InterviewRound["status"];
  appointment_json: string;
};
type FeedbackRow = {
  round_id: string;
  interviewer: string;
  status: "draft" | "submitted";
  scorecard_json: string;
  entered_by: string;
  updated_at: string;
};
const conflict = () =>
  fail(
    "Interview progress changed. Refresh and review the latest information before trying again; your entered data can be kept.",
    409,
  );
async function hash(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function processDto(
  row: ProcessRow,
  rounds: InterviewRound[],
): InterviewProcess {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    position: row.position,
    responsible: row.responsible,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    snapshot: JSON.parse(row.snapshot_json),
    rounds,
    roundsComplete: !!row.rounds_complete,
    stage: interviewStage(rounds, !!row.rounds_complete),
    outcome: row.outcome,
    decisionReason: row.decision_reason,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    hold: row.hold_json ? JSON.parse(row.hold_json) : null,
    activity: [],
  };
}
async function ownedProcesses(owner: string, id?: string) {
  const db = getDatabaseBinding();
  const rows = (
    await db
      .prepare(
        "SELECT p.* FROM interview_processes p JOIN candidates c ON c.id=p.candidate_id AND c.owner_email=p.owner_email WHERE p.owner_email=?" +
          (id ? " AND p.id=?" : "") +
          " ORDER BY p.updated_at DESC,p.id",
      )
      .bind(owner, ...(id ? [id] : []))
      .all<ProcessRow>()
  ).results;
  if (!rows.length) return [];
  const ids = JSON.stringify(rows.map((p) => p.id));
  const [rounds, feedback] = await Promise.all([
    db
      .prepare(
        "SELECT r.* FROM interview_rounds r JOIN interview_processes p ON p.id=r.process_id WHERE p.owner_email=? AND p.id IN (SELECT value FROM json_each(?)) ORDER BY r.created_at,r.id",
      )
      .bind(owner, ids)
      .all<RoundRow>(),
    db
      .prepare(
        "SELECT f.* FROM interview_feedback f JOIN interview_rounds r ON r.id=f.round_id JOIN interview_processes p ON p.id=r.process_id WHERE p.owner_email=? AND p.id IN (SELECT value FROM json_each(?))",
      )
      .bind(owner, ids)
      .all<FeedbackRow>(),
  ]);
  return rows.map((row) =>
    processDto(
      row,
      rounds.results
        .filter((r) => r.process_id === row.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          interviewers: JSON.parse(r.interviewers_json),
          status: r.status,
          appointment: JSON.parse(r.appointment_json),
          feedback: feedback.results
            .filter((f) => f.round_id === r.id)
            .map((f) => ({
              interviewer: f.interviewer,
              status: f.status,
              scorecard: JSON.parse(f.scorecard_json),
              enteredBy: f.entered_by,
              updatedAt: f.updated_at,
            })),
        })),
    ),
  );
}
export async function detailInterview(owner: string, id: string) {
  identifier(id, "interview process");
  const process = (await ownedProcesses(owner, id))[0];
  if (!process) fail("Interview process not found in your workspace.", 404);
  const rows = (
    await getDatabaseBinding()
      .prepare(
        "SELECT e.* FROM interview_events e JOIN interview_processes p ON p.id=e.process_id WHERE p.owner_email=? AND p.id=? ORDER BY e.created_at DESC,e.rowid DESC LIMIT 200",
      )
      .bind(owner, id)
      .all<{
        id: string;
        action: string;
        actor: string;
        details_json: string;
        created_at: string;
      }>()
  ).results;
  process.activity = rows.map((e) => ({
    id: e.id,
    action: e.action,
    actor: e.actor,
    at: e.created_at,
    details: JSON.parse(e.details_json),
  }));
  return process;
}
export async function listInterviews(owner: string, query: URLSearchParams) {
  const all = await ownedProcesses(owner),
    closed = query.get("tab") === "closed",
    filter = query.get("filter") ?? "all",
    search = (query.get("search") ?? "").trim().slice(0, 200).toLowerCase();
  const matching = all.filter(
    (p) =>
      !!p.outcome === closed &&
      (!search ||
        `${p.snapshot.name} ${p.snapshot.email} ${p.snapshot.telegram} ${p.position}`
          .toLowerCase()
          .includes(search)),
  );
  const items = matching.filter(
    (p) =>
      filter === "all" ||
      (filter === "hold" ? !!p.hold : (p.outcome ?? p.stage) === filter),
  );
  const pageSize = 25,
    total = items.length,
    pages = Math.max(1, Math.ceil(total / pageSize)),
    page = Math.min(
      pages,
      Math.max(1, Math.floor(Number(query.get("page")) || 1)),
    );
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    counts: Object.fromEntries(
      [...OUTCOMES, "ready", "scheduled", "feedback", "decision", "hold"].map(
        (s) => [
          s,
          matching.filter((p) =>
            s === "hold" ? !!p.hold : (p.outcome ?? p.stage) === s,
          ).length,
        ],
      ),
    ),
    active: all.filter((p) => !p.outcome).length,
    closed: all.filter((p) => p.outcome).length,
  };
}
function eventStatements(
  process: Pick<InterviewProcess, "id" | "candidateId" | "position">,
  owner: string,
  action: string,
  mutationId: string,
  requestHash: string,
  details: Record<string, unknown>,
  now: string,
) {
  const db = getDatabaseBinding(),
    id = crypto.randomUUID();
  return [
    db
      .prepare(
        "INSERT INTO interview_events(id,process_id,mutation_id,request_hash,action,actor,details_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        process.id,
        mutationId,
        requestHash,
        action,
        owner,
        JSON.stringify(details),
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_events(id,owner_email,actor_type,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES(?,?,'owner',?,?,'candidate',?,?,?)",
      )
      .bind(
        id,
        owner,
        owner,
        `candidate.interview_${action}`,
        process.candidateId,
        JSON.stringify({
          processId: process.id,
          position: process.position,
          ...details,
        }),
        now,
      ),
  ];
}
export async function handoffInterview(
  owner: string,
  candidateId: string,
  body: Record<string, unknown>,
) {
  identifier(candidateId, "candidate");
  const db = getDatabaseBinding();
  const existing = await db
    .prepare(
      "SELECT id FROM interview_processes WHERE candidate_id=? AND owner_email=?",
    )
    .bind(candidateId, owner)
    .first<{ id: string }>();
  if (existing)
    return { process: await detailInterview(owner, existing.id), reused: true };
  const position = boundedText(body.position, "a position/title", 2, 160),
    responsible = boundedText(
      body.responsible ?? owner,
      "a responsible person",
      2,
      160,
    );
  const mutationId = identifier(body.mutationId, "request identifier"),
    requestHash = await hash(body);
  const proof = await db
    .prepare(preparationProofSql)
    .bind(owner, candidateId)
    .first<{ proof: string }>();
  if (!proof || proof.proof.length > 750000)
    fail(
      "This preparation has too much history for one safe handoff. Contact your administrator.",
      413,
    );
  const e = await preparationForInterview(owner, candidateId);
  if (body.expectedRevision !== e.item.revision) conflict();
  if (e.item.automaticStage !== "accepted" || !e.cv.approvalId)
    fail(
      "HR must accept all required documents for the current approved CV and preparation before moving to interviews.",
      422,
    );
  const required = JSON.stringify(
    e.relevant.map((f) => ({ id: f.id, submissionId: f.submissionId })),
  );
  const ownedAcceptance = await db
    .prepare(
      "SELECT count(*) count FROM json_each(?) j JOIN form_assignments f ON f.id=json_extract(j.value,'$.id') JOIN recipient_profiles a ON a.user_id=f.user_id AND a.created_by_email=? JOIN templates t ON t.id=f.template_id AND t.owner_email=a.created_by_email JOIN recipient_links l ON l.id=f.recipient_link_id AND l.assigned_user_id=f.user_id JOIN submissions s ON s.id=json_extract(j.value,'$.submissionId') AND s.recipient_link_id=f.recipient_link_id AND s.template_id=f.template_id AND s.template_version_id=f.template_version_id JOIN submission_reviews h ON h.submission_id=s.id AND h.owner_email=a.created_by_email AND h.reviewed_by=a.created_by_email AND h.status='accepted' WHERE f.status='completed'",
    )
    .bind(required, owner)
    .first<{ count: number }>();
  if (ownedAcceptance?.count !== e.relevant.length)
    fail(
      "Every required document needs an acceptance recorded by this workspace's management owner before handoff.",
      422,
    );
  const now = new Date().toISOString(),
    id = crypto.randomUUID(),
    guardId = crypto.randomUUID();
  const snapshot: PreparationSnapshot = {
    name: e.item.name,
    email: e.item.email,
    telegram: e.item.telegram,
    cv: e.item.selectedCv,
    profileId: e.cv.approvalId,
    runId: e.run?.id ?? null,
    accountId: e.item.accountId ?? null,
    forms: e.item.forms,
    acceptedAt: now,
  };
  const process = { id, candidateId, position };
  // No record is created on reads or migration. One process per candidate makes handoff retries idempotent.
  const statements = [
    db
      .prepare(
        `INSERT INTO interview_guards(id,check_passed) SELECT ?,CASE WHEN (SELECT proof FROM (${preparationProofSql}))=? THEN 1 ELSE 0 END`,
      )
      .bind(guardId, owner, candidateId, proof.proof),
    db
      .prepare(
        "INSERT INTO interview_processes(id,owner_email,candidate_id,resume_id,profile_id,run_id,account_id,position,responsible,snapshot_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        owner,
        candidateId,
        e.cv.resumeId,
        e.cv.approvalId,
        e.run?.id ?? null,
        e.item.accountId ?? null,
        position,
        responsible,
        JSON.stringify(snapshot),
        owner,
        now,
        now,
      ),
    ...e.relevant.map((f) =>
      db
        .prepare(
          "INSERT INTO interview_documents(id,process_id,assignment_id,submission_id) VALUES(?,?,?,?)",
        )
        .bind(crypto.randomUUID(), id, f.id, f.submissionId),
    ),
    ...eventStatements(
      process,
      owner,
      "started",
      mutationId,
      requestHash,
      {
        cv: e.cv.fileName,
        runId: e.run?.id ?? null,
        acceptedDocuments: e.item.forms.map((f) => f.name),
      },
      now,
    ),
    db.prepare("DELETE FROM interview_guards WHERE id=?").bind(guardId),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const winner = await db
      .prepare(
        "SELECT id FROM interview_processes WHERE candidate_id=? AND owner_email=?",
      )
      .bind(candidateId, owner)
      .first<{ id: string }>();
    if (winner)
      return { process: await detailInterview(owner, winner.id), reused: true };
    if (
      error instanceof Error &&
      /interview_checked|UNIQUE|FOREIGN KEY/.test(error.message)
    )
      conflict();
    throw error;
  }
  return { process: await detailInterview(owner, id), reused: false };
}
export async function mutateInterview(
  owner: string,
  id: string,
  body: Record<string, unknown>,
) {
  const process = await detailInterview(owner, id),
    db = getDatabaseBinding(),
    mutationId = identifier(body.mutationId, "request identifier"),
    requestHash = await hash(body);
  const prior = await db
    .prepare(
      "SELECT request_hash FROM interview_events WHERE process_id=? AND mutation_id=?",
    )
    .bind(id, mutationId)
    .first<{ request_hash: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash)
      fail(
        "This request identifier was already used for different data. Refresh and try again.",
        409,
      );
    return { process: await detailInterview(owner, id), reused: true };
  }
  if (
    !Number.isInteger(body.expectedVersion) ||
    body.expectedVersion !== process.version
  )
    conflict();
  const action = boundedText(body.action, "an interview action", 1, 40),
    now = new Date().toISOString(),
    guardId = crypto.randomUUID();
  if (process.outcome && !["reopen", "correct_decision"].includes(action))
    fail(
      "This interview process is closed. Reopen it with a reason before changing appointments or feedback.",
      409,
    );
  if (process.hold && !["resume", "withdraw"].includes(action))
    fail(
      "This interview process is on hold. Resume it before making changes.",
      409,
    );
  const effects: DatabaseStatement[] = [],
    details: Record<string, unknown> = {};
  const update = (sql: string, ...values: unknown[]) =>
    effects.push(
      db
        .prepare(
          `UPDATE interview_processes SET ${sql} WHERE id=? AND owner_email=?`,
        )
        .bind(...values, id, owner),
    );
  const round = () => {
    const roundId = identifier(body.roundId, "round"),
      r = process.rounds.find((r) => r.id === roundId);
    if (!r) fail("Choose a round belonging to this interview process.", 404);
    return r;
  };
  if (action === "schedule") {
    if (process.rounds.length >= 30)
      fail(
        "This process already has 30 rounds. Review its existing rounds.",
        422,
      );
    if (
      process.rounds.some(
        (r) => r.status === "scheduled" || missingFeedback(r).length,
      )
    )
      fail(
        "Complete the scheduled round and its required feedback before scheduling another round.",
        422,
      );
    const name = boundedText(body.name, "an interview name", 2, 160),
      interviewers = parseInterviewers(body.interviewers),
      appointment = parseAppointment(body.appointment),
      roundId = crypto.randomUUID();
    if (appointment.startsAt <= now)
      fail("Schedule an upcoming interview time.", 422);
    effects.push(
      db
        .prepare(
          "INSERT INTO interview_rounds(id,process_id,name,interviewers_json,status,appointment_json,created_at,updated_at) VALUES(?,?,?,?,'scheduled',?,?,?)",
        )
        .bind(
          roundId,
          id,
          name,
          JSON.stringify(interviewers),
          JSON.stringify(appointment),
          now,
          now,
        ),
    );
    update("rounds_complete=0");
    Object.assign(details, { roundId, name, interviewers, appointment });
  } else if (["reschedule", "cancel", "complete", "no_show"].includes(action)) {
    const r = round();
    if (action !== "reschedule" && r.status !== "scheduled")
      fail(
        "Only a scheduled round can be cancelled, completed or recorded as a no-show.",
        422,
      );
    if (
      action === "reschedule" &&
      !["scheduled", "cancelled", "no_show"].includes(r.status)
    )
      fail(
        "A completed round cannot be rescheduled. Schedule another round.",
        422,
      );
    const next =
      action === "reschedule"
        ? "scheduled"
        : action === "complete"
          ? "completed"
          : action === "cancel"
            ? "cancelled"
            : "no_show";
    const appointment =
      action === "reschedule"
        ? parseAppointment(body.appointment)
        : r.appointment;
    if (action === "reschedule" && appointment.startsAt <= now)
      fail("Reschedule to an upcoming interview time.", 422);
    if (
      ["complete", "no_show"].includes(action) &&
      r.appointment.startsAt > now
    )
      fail(
        "Wait until the interview start time before recording completion or a no-show.",
        422,
      );
    effects.push(
      db
        .prepare(
          "UPDATE interview_rounds SET status=?,appointment_json=?,updated_at=? WHERE id=? AND process_id=?",
        )
        .bind(next, JSON.stringify(appointment), now, r.id, id),
    );
    update("rounds_complete=0");
    Object.assign(details, {
      roundId: r.id,
      name: r.name,
      previousStatus: r.status,
      previousAppointment: r.appointment,
      appointment,
      status: next,
      reason: ["reschedule", "cancel", "no_show"].includes(action)
        ? reason(body.reason)
        : "",
    });
  } else if (action === "feedback") {
    const r = round();
    if (r.status !== "completed")
      fail("Mark the interview completed before recording feedback.", 422);
    if (process.roundsComplete)
      fail(
        "The rounds are complete for final review. Schedule another round before changing submitted evaluations.",
        409,
      );
    const interviewer = boundedText(
      body.interviewer,
      "a required interviewer",
      2,
      120,
    );
    if (!r.interviewers.includes(interviewer))
      fail("Choose a named required interviewer for this round.", 422);
    if (!["draft", "submitted"].includes(String(body.status)))
      fail("Choose draft or submitted feedback.", 422);
    const scorecard = parseScorecard(body.scorecard),
      previous = r.feedback.find((f) => f.interviewer === interviewer);
    if (previous?.status === "submitted")
      fail(
        "Submitted feedback is retained as evidence and cannot be overwritten. Schedule another round if reassessment is needed.",
        409,
      );
    effects.push(
      db
        .prepare(
          "INSERT INTO interview_feedback(id,round_id,interviewer,status,scorecard_json,entered_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(round_id,interviewer) DO UPDATE SET status=excluded.status,scorecard_json=excluded.scorecard_json,entered_by=excluded.entered_by,updated_at=excluded.updated_at",
        )
        .bind(
          crypto.randomUUID(),
          r.id,
          interviewer,
          body.status,
          JSON.stringify(scorecard),
          owner,
          now,
        ),
    );
    Object.assign(details, {
      roundId: r.id,
      interviewer,
      status: body.status,
      scorecard,
      previous: previous ?? null,
    });
  } else if (action === "finish_rounds") {
    if (
      !process.rounds.some((r) => r.status === "completed") ||
      process.rounds.some(
        (r) => r.status === "scheduled" || missingFeedback(r).length,
      )
    )
      fail(
        "Complete at least one interview and submit every required evaluation; resolve any scheduled round before final review.",
        422,
      );
    if (process.roundsComplete)
      fail("These rounds are already complete for final review.", 409);
    update("rounds_complete=1");
  } else if (["decide", "correct_decision", "withdraw"].includes(action)) {
    const outcome = action === "withdraw" ? "withdrawn" : body.outcome;
    if (
      !OUTCOMES.includes(outcome as InterviewOutcome) ||
      (action !== "withdraw" && outcome === "withdrawn")
    )
      fail("Choose Interview passed or Not selected.", 422);
    if (action === "correct_decision" && !process.outcome)
      fail("There is no closed decision to correct.", 422);
    if (action !== "withdraw" && process.stage !== "decision")
      fail(
        "Complete the rounds and required feedback before recording a final decision.",
        422,
      );
    const decisionReason = reason(body.reason);
    update(
      "outcome=?,decision_reason=?,decided_by=?,decided_at=?,hold_json=NULL",
      outcome,
      decisionReason,
      owner,
      now,
    );
    Object.assign(details, {
      previousDecision: {
        outcome: process.outcome,
        reason: process.decisionReason,
        actor: process.decidedBy,
        at: process.decidedAt,
      },
      outcome,
      reason: decisionReason,
    });
  } else if (action === "reopen") {
    if (!process.outcome)
      fail("This interview process is already active.", 422);
    update(
      "outcome=NULL,decision_reason='',decided_by=NULL,decided_at=NULL,hold_json=NULL",
    );
    Object.assign(details, {
      reason: reason(body.reason),
      previousDecision: {
        outcome: process.outcome,
        reason: process.decisionReason,
        actor: process.decidedBy,
        at: process.decidedAt,
      },
    });
  } else if (action === "hold") {
    const followUp = body.followUp || null;
    if (
      followUp !== null &&
      (typeof followUp !== "string" ||
        !/^\d{4}-\d\d-\d\d$/.test(followUp) ||
        !Number.isFinite(Date.parse(followUp)) ||
        new Date(followUp).toISOString().slice(0, 10) !== followUp ||
        followUp < now.slice(0, 10) ||
        followUp > "2100-12-31")
    )
      fail("Choose a real optional follow-up date today or later.", 422);
    const hold = {
      reason: reason(body.reason),
      followUp,
      previousStage: process.stage,
    };
    update("hold_json=?", JSON.stringify(hold));
    Object.assign(details, hold);
  } else if (action === "resume") {
    if (!process.hold) fail("This interview process is not on hold.", 422);
    update("hold_json=NULL");
    Object.assign(details, {
      previousHold: process.hold,
      reason: reason(body.reason),
    });
  } else fail("Choose a supported interview action.", 422);
  const statements = [
    db
      .prepare(
        "INSERT INTO interview_guards(id,check_passed) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM interview_processes WHERE id=? AND owner_email=? AND version=?) THEN 1 ELSE 0 END",
      )
      .bind(guardId, id, owner, process.version),
    ...effects,
    db
      .prepare(
        "UPDATE interview_processes SET version=version+1,updated_at=? WHERE id=? AND owner_email=?",
      )
      .bind(now, id, owner),
    ...eventStatements(
      process,
      owner,
      action,
      mutationId,
      requestHash,
      details,
      now,
    ),
    db.prepare("DELETE FROM interview_guards WHERE id=?").bind(guardId),
  ];
  try {
    await db.batch(statements);
  } catch (error) {
    const receipt = await db
      .prepare(
        "SELECT request_hash FROM interview_events WHERE process_id=? AND mutation_id=?",
      )
      .bind(id, mutationId)
      .first<{ request_hash: string }>();
    if (receipt?.request_hash === requestHash)
      return { process: await detailInterview(owner, id), reused: true };
    if (
      error instanceof Error &&
      /interview_checked|UNIQUE/.test(error.message)
    )
      conflict();
    throw error;
  }
  return { process: await detailInterview(owner, id), reused: false };
}
