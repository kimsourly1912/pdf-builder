import "server-only";
import { getDatabaseBinding } from "@/db";
import { detailInterview } from "@/features/interviews/interviews.server";
import type { PreparationSnapshot } from "@/features/interviews/interviews";
import { preparationProofSql } from "@/features/interviews/preparation-proof.server";
import {
  getApplication,
  hiringConfiguration,
  hiringFail,
  hiringId,
  applicationFacts,
  applicationProof,
  requireEvidence,
  hiringGuard,
  hiringBatch,
  nowIso,
  applicationEvent,
} from "./hiring.server";

export async function startApplicationInterview(
  owner: string,
  id: string,
  body: Record<string, unknown>,
) {
  const app = await getApplication(owner, id),
    db = getDatabaseBinding();
  hiringId(body.mutationId);
  if (app.interviewId)
    return {
      process: await detailInterview(owner, app.interviewId),
      reused: true,
    };
  if (app.revision !== body.expectedRevision)
    hiringFail(
      "This application changed. Refresh before starting interviews.",
      409,
    );
  if (app.outcome || app.hold)
    hiringFail("Reopen or resume before starting interviews.");
  const config = await hiringConfiguration(owner),
    pipeline = config.versions.find((v) => v.id === app.pipelineVersionId),
    stage = pipeline?.definition.stages.find((s) => s.id === app.stageId);
  if (stage?.activity !== "interview")
    hiringFail("Move to an interview stage before starting interviews.");
  if (!app.jobId) hiringFail("Assign a job before starting interviews.");
  const proof = await applicationProof(owner, app);
  await requireEvidence(owner, app, ["cv_approved", ...stage.entry]);
  const facts = await applicationFacts(owner, app);
  if (!facts.profileId)
    hiringFail("Approve the current CV before starting interviews.");
  const candidate = await db
    .prepare(
      "SELECT c.user_id,r.created_at FROM candidates c JOIN resumes r ON r.candidate_id=c.id AND r.owner_email=c.owner_email WHERE c.id=? AND r.id=? AND c.owner_email=?",
    )
    .bind(app.candidateId, app.resumeId, owner)
    .first<{ user_id: string | null; created_at: string }>();
  if (!candidate) hiringFail("The application's CV is unavailable.");
  const accepted = (
    await db
      .prepare(
        `SELECT f.id,t.name,f.template_id,v.version_number,f.completed_at,s.id submission_id FROM form_assignments f JOIN templates t ON t.id=f.template_id AND t.owner_email=? JOIN template_versions v ON v.id=f.template_version_id JOIN submissions s ON s.recipient_link_id=f.recipient_link_id JOIN submission_reviews h ON h.submission_id=s.id AND h.owner_email=t.owner_email AND h.reviewed_by=t.owner_email AND h.status='accepted' WHERE f.id IN (SELECT value FROM json_each(?)) AND f.status='completed' AND s.id=(SELECT s2.id FROM submissions s2 WHERE s2.recipient_link_id=f.recipient_link_id ORDER BY s2.submitted_at DESC,s2.id DESC LIMIT 1)`,
      )
      .bind(owner, JSON.stringify(app.evidence.assignments ?? []))
      .all<{
        id: string;
        name: string;
        template_id: string;
        version_number: number;
        completed_at: string;
        submission_id: string;
      }>()
  ).results;
  const at = nowIso(),
    processId = crypto.randomUUID();
  const snapshot: PreparationSnapshot = {
    contextKind: "approved_cv",
    name: app.name,
    email: app.email,
    telegram: "",
    cv: {
      id: app.resumeId,
      fileName: app.fileName,
      receivedAt: candidate.created_at,
      verified: true,
      archived: false,
      intakeId: null,
    },
    profileId: facts.profileId,
    runId: app.evidence.runId ?? null,
    accountId: candidate.user_id,
    forms: accepted.map((f) => ({
      id: f.id,
      name: f.name,
      templateId: f.template_id,
      versionNumber: f.version_number,
      status: "completed",
      reviewStatus: "accepted",
      completedAt: f.completed_at,
      reused: true,
      url: null,
    })),
    acceptedAt: at,
  };
  const [guard, cleanup] = hiringGuard(
    `EXISTS(SELECT 1 FROM hiring_applications WHERE id=? AND owner_email=? AND revision=? AND interview_id IS NULL) AND (SELECT proof FROM (${preparationProofSql}))=? AND EXISTS(SELECT 1 FROM hiring_pipelines WHERE current_version_id=? AND owner_email=? AND revision=?)`,
    [id, owner, app.revision, owner, app.candidateId, proof, app.pipelineVersionId, owner, pipeline!.revision],
  );
  try {
    await hiringBatch([
      guard,
      db
        .prepare(
          "INSERT INTO interview_processes(id,application_id,owner_email,candidate_id,resume_id,profile_id,run_id,account_id,position,responsible,snapshot_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          processId,
          id,
          owner,
          app.candidateId,
          app.resumeId,
          facts.profileId,
          app.evidence.runId ?? null,
          candidate.user_id,
          app.jobTitle,
          owner,
          JSON.stringify(snapshot),
          owner,
          at,
          at,
        ),
      ...accepted.map((f) =>
        db
          .prepare(
            "INSERT INTO interview_documents(id,process_id,assignment_id,submission_id) VALUES(?,?,?,?)",
          )
          .bind(crypto.randomUUID(), processId, f.id, f.submission_id),
      ),
      db
        .prepare(
          "INSERT INTO interview_events(id,process_id,mutation_id,request_hash,action,actor,details_json,created_at) VALUES(?,?,?,?,'started',?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          processId,
          body.mutationId,
          `application_${id}`,
          owner,
          JSON.stringify({ applicationId: id, cv: app.fileName }),
          at,
        ),
      db
        .prepare(
          "UPDATE hiring_applications SET interview_id=?,revision=revision+1,updated_at=? WHERE id=? AND owner_email=?",
        )
        .bind(processId, at, id, owner),
      applicationEvent(
        owner,
        { ...app, revision: app.revision + 1, interviewId: processId },
        "interviews_started",
        null,
      ),
      cleanup,
    ]);
  } catch (error) {
    const winner = await getApplication(owner, id);
    if (winner.interviewId)
      return {
        process: await detailInterview(owner, winner.interviewId),
        reused: true,
      };
    throw error;
  }
  return { process: await detailInterview(owner, processId), reused: false };
}
