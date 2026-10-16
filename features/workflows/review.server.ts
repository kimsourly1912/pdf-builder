import {
  telegramConnections,
  telegramIntakes,
} from "@/features/telegram/schema";
import "server-only";
import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  hiringApplications,
  candidateProfileVersions,
  candidates,
  recipientProfiles,
  resumeExtractions,
  resumes,
  user,
} from "@/db/schema";
import {
  generateTemporaryPassword,
  isStrongAccountPassword,
} from "@/features/accounts/account-share";
import { candidateProfileFromSummary } from "@/features/resumes/candidate-profile";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/resumes/resume-extraction";
import {
  candidateSummary,
  parseCandidateUpdate,
} from "@/features/resumes/resume.server";
import { workflowRuns, workflowReviewDecisions } from "./schema";
import { claimRun, fail, getRun, workflowAudit } from "./workflow.server";
import { nextNode, type RunContext, type WorkflowGraph } from "./workflow";

export async function getReviewData(ownerEmail: string, runId: string) {
  const run = await getRun(ownerEmail, runId);
  const [resume] = await getDb()
    .select()
    .from(resumes)
    .where(
      and(eq(resumes.id, run.resumeId), eq(resumes.ownerEmail, ownerEmail)),
    )
    .limit(1);
  if (!resume) fail("The resume was removed.", 404);
  const [candidate] = resume.candidateId
    ? await getDb()
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, resume.candidateId),
            eq(candidates.ownerEmail, ownerEmail),
          ),
        )
        .limit(1)
    : [];
  const [extraction] = await getDb()
    .select()
    .from(resumeExtractions)
    .where(eq(resumeExtractions.resumeId, resume.id))
    .orderBy(desc(resumeExtractions.versionNumber))
    .limit(1);
  const [existingAccount] = candidate?.normalizedEmail
    ? await getDb()
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .innerJoin(recipientProfiles, eq(user.id, recipientProfiles.userId))
        .where(
          and(
            eq(user.email, candidate.normalizedEmail),
            eq(recipientProfiles.createdByEmail, ownerEmail),
            eq(recipientProfiles.accountType, "candidate"),
            eq(user.banned, false),
          ),
        )
        .limit(1)
    : [];
  const connections = await getDb()
    .select({
      id: telegramConnections.id,
      fullName: telegramConnections.fullName,
      email: telegramConnections.email,
      username: telegramConnections.username,
      confirmedCandidateId: telegramConnections.confirmedCandidateId,
      confirmedBy: telegramConnections.confirmedBy,
    })
    .from(telegramConnections)
    .where(eq(telegramConnections.ownerEmail, ownerEmail))
    .limit(200);
  const [intake] = await getDb()
    .select({ connectionId: telegramIntakes.connectionId })
    .from(telegramIntakes)
    .where(
      and(
        eq(telegramIntakes.resumeId, run.resumeId),
        eq(telegramIntakes.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  return {
    telegramConnections: connections.map((c) => ({
      ...c,
      confirmedCandidateId:
        c.confirmedBy === ownerEmail ? c.confirmedCandidateId : null,
    })),
    suggestedConnectionId: intake?.connectionId ?? null,
    run,
    candidate: candidateSummary(candidate ?? null),
    resumeRevision: resume.updatedAt,
    candidateRevision: candidate?.updatedAt ?? null,
    possibleDuplicate: !!resume.duplicateCandidateId,
    existingAccount: existingAccount ?? null,
    extraction: extraction
      ? (JSON.parse(extraction.fieldsJson) as unknown)
      : null,
  };
}

export async function reviewRun(
  ownerEmail: string,
  runId: string,
  body: Record<string, unknown>,
) {
  await getRun(ownerEmail, runId);
  if (!["save", "approve", "reject"].includes(String(body.action)))
    fail("Choose save, approve, or reject.");
  const claim = await claimRun(runId, ["waiting_review"]);
  if (!claim)
    fail(
      "This review is already being handled or has finished. Refresh the run.",
      409,
    );
  const { row, token } = claim;
  let committed = false;
  try {
    if (row.applicationId) {
      const [application] = await getDb()
        .select()
        .from(hiringApplications)
        .where(
          and(
            eq(hiringApplications.id, row.applicationId),
            eq(hiringApplications.ownerEmail, ownerEmail),
          ),
        )
        .limit(1);
      if (
        !application ||
        application.hold ||
        application.outcome ||
        application.resumeId !== row.resumeId
      )
        fail(
          "Resume or reopen the hiring application and verify its selected CV before reviewing preparation.",
          409,
        );
    }
    const graph = JSON.parse(row.graphJson) as WorkflowGraph;
    const node = graph.nodes.find((n) => n.id === row.currentNodeId);
    if (node?.kind !== "review_resume")
      fail("This run is not at a review step.", 409);
    const context = JSON.parse(row.contextJson) as RunContext;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > 2000) fail("Keep review notes within 2,000 characters.");
    const now = new Date().toISOString();
    if (body.action === "reject") {
      if (!note) fail("Add a reason for rejecting this resume.");
      Object.assign(context, {
        rejection: true,
        reviewer: ownerEmail,
        reviewedAt: now,
        reviewNote: note,
      });
      context.steps[node.id] = {
        status: "completed",
        attempts: context.steps[node.id]?.attempts ?? 1,
        completedAt: now,
        outcome: "rejected",
        note: "Rejected by reviewer",
      };
      await getDb().batch([
        getDb()
          .update(workflowRuns)
          .set({
            status: "queued",
            currentNodeId: nextNode(graph, node.id, "rejected"),
            contextJson: JSON.stringify(context),
            passwordHash: null,
            lockToken: null,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(
            and(eq(workflowRuns.id, row.id), eq(workflowRuns.lockToken, token)),
          ),
        workflowAudit(ownerEmail, "workflow.review_rejected", row.id, {
          resumeId: row.resumeId,
        }),
      ]);
      committed = true;
      return;
    }
    const [resume] = await getDb()
      .select()
      .from(resumes)
      .where(
        and(eq(resumes.id, row.resumeId), eq(resumes.ownerEmail, ownerEmail)),
      )
      .limit(1);
    if (!resume?.candidateId)
      fail(
        "Resolve this resume's candidate link in the Resume Library before reviewing.",
        409,
      );
    const [candidate] = await getDb()
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.id, resume.candidateId),
          eq(candidates.ownerEmail, ownerEmail),
        ),
      )
      .limit(1);
    if (
      !candidate ||
      resume.updatedAt !== body.resumeRevision ||
      candidate.updatedAt !== body.candidateRevision
    )
      fail("This resume changed. Reload before reviewing.", 409);
    const update = parseCandidateUpdate(body.candidate);
    if (!update || !update.fullName.trim())
      fail("Enter valid candidate information and a full name.", 422);
    const approving = body.action === "approve";
    if (
      approving &&
      (!update.email ||
        !Array.isArray(body.checks) ||
        body.checks.length !== 3 ||
        !body.checks.every((v) => v === true))
    )
      fail(
        "Check the CV, extracted data, and candidate contact details before approval.",
        422,
      );
    if (approving && resume.duplicateCandidateId)
      fail(
        "Resolve the possible duplicate in the Resume Library before approval.",
        409,
      );
    const nameParts = update.fullName.split(/\s+/u);
    const changes = {
      ...update,
      firstName: nameParts[0] ?? "",
      lastName: nameParts.slice(1).join(" "),
      normalizedEmail: normalizeEmail(update.email),
      normalizedPhone: normalizePhone(update.phone),
      skillsJson: JSON.stringify(update.skills),
      workExperienceJson: JSON.stringify(update.workExperience),
      educationJson: JSON.stringify(update.education),
      certificationsJson: JSON.stringify(update.certifications),
      languagesJson: JSON.stringify(update.languages),
      linksJson: JSON.stringify(update.links),
      verificationStatus: approving ? "verified" : "extracted",
      updatedAt: now,
    };
    // Array values are stored in the existing JSON columns, not extra columns.
    const {
      skills,
      workExperience,
      education,
      certifications,
      languages,
      links,
      ...storedChanges
    } = changes;
    void skills;
    void workExperience;
    void education;
    void certifications;
    void languages;
    void links;
    const nextCandidate = { ...candidate, ...storedChanges };
    const guard = () =>
      getDb()
        .insert(workflowReviewDecisions)
        .values({
          id: crypto.randomUUID(),
          runId: row.id,
          ownerEmail,
          candidateId: candidate.id,
          runLockToken: token,
          resumeRevision: resume.updatedAt,
          candidateRevision: candidate.updatedAt,
          action: approving ? "approve" : "save",
          createdAt: now,
        });
    let passwordHash: string | null = null;
    const sendsTelegram = graph.nodes.some((n) => n.kind === "send_telegram");
    let telegramConnection: typeof telegramConnections.$inferSelect | undefined;
    if (
      approving &&
      sendsTelegram &&
      typeof body.telegramConnectionId === "string" &&
      body.telegramConnectionId
    ) {
      if (body.confirmTelegram !== true)
        fail(
          "Confirm that the Telegram contact belongs to this candidate.",
          422,
        );
      [telegramConnection] = await getDb()
        .select()
        .from(telegramConnections)
        .where(
          and(
            eq(telegramConnections.id, body.telegramConnectionId),
            eq(telegramConnections.ownerEmail, ownerEmail),
          ),
        )
        .limit(1);
      if (!telegramConnection) fail("Telegram connection unavailable.", 409);
      context.telegramConnectionId = telegramConnection.id;
      context.telegramChatId = telegramConnection.chatId;
    } else if (approving) {
      delete context.telegramConnectionId;
      delete context.telegramChatId;
    }

    if (approving) {
      const [emailAccount] = await getDb()
        .select()
        .from(user)
        .where(eq(user.email, nextCandidate.normalizedEmail))
        .limit(1);
      if (emailAccount) {
        const [recipient] = await getDb()
          .select()
          .from(recipientProfiles)
          .where(
            and(
              eq(recipientProfiles.userId, emailAccount.id),
              eq(recipientProfiles.createdByEmail, ownerEmail),
              eq(recipientProfiles.accountType, "candidate"),
            ),
          )
          .limit(1);
        const [linked] = await getDb()
          .select({ id: candidates.id })
          .from(candidates)
          .where(eq(candidates.userId, emailAccount.id))
          .limit(1);
        if (
          !recipient ||
          emailAccount.banned ||
          (linked && linked.id !== candidate.id)
        )
          fail(
            "This email is unavailable for the candidate. Resolve its account or resume link in Accounts.",
            409,
          );
        if (body.existingAccountId !== emailAccount.id)
          fail(
            "An account with this email exists. Select and confirm it before approval.",
            409,
          );
        context.userId = emailAccount.id;
        context.activationRequired = false;
      } else {
        if (candidate.userId)
          fail(
            "The linked account uses a different email. Resolve it in Accounts before approval.",
            409,
          );
        const password = sendsTelegram
          ? generateTemporaryPassword(32)
          : typeof body.temporaryPassword === "string"
            ? body.temporaryPassword
            : "";
        context.activationRequired = sendsTelegram;
        if (!isStrongAccountPassword(password))
          fail(
            "Set a 12–128 character temporary password with uppercase, lowercase, number, and symbol.",
            422,
          );
        passwordHash = await hashPassword(password);
        delete context.userId;
      }
      Object.assign(context, {
        candidateId: candidate.id,
        reviewedName: update.fullName,
        reviewedEmail: nextCandidate.normalizedEmail,
        reviewer: ownerEmail,
        reviewedAt: now,
        reviewNote: note,
        approvedCandidate: candidateSummary(nextCandidate)!,
      });
      const [latest] = await getDb()
        .select({ version: candidateProfileVersions.versionNumber })
        .from(candidateProfileVersions)
        .where(eq(candidateProfileVersions.candidateId, candidate.id))
        .orderBy(desc(candidateProfileVersions.versionNumber))
        .limit(1);
      const [extraction] = await getDb()
        .select({ id: resumeExtractions.id })
        .from(resumeExtractions)
        .where(eq(resumeExtractions.resumeId, resume.id))
        .orderBy(desc(resumeExtractions.versionNumber))
        .limit(1);
      const [retainedProfile] =
        row.applicationId &&
        resume.verificationStatus === "verified" &&
        candidate.verificationStatus === "verified" &&
        JSON.stringify(candidateSummary(candidate)) ===
          JSON.stringify(candidateSummary(nextCandidate))
          ? await getDb()
              .select()
              .from(candidateProfileVersions)
              .where(
                and(
                  eq(candidateProfileVersions.resumeId, resume.id),
                  eq(candidateProfileVersions.candidateId, candidate.id),
                  eq(candidateProfileVersions.ownerEmail, ownerEmail),
                  eq(candidateProfileVersions.createdByEmail, ownerEmail),
                  eq(candidateProfileVersions.verificationStatus, "verified"),
                  gte(candidateProfileVersions.createdAt, resume.updatedAt),
                  gte(candidateProfileVersions.createdAt, candidate.updatedAt),
                ),
              )
              .orderBy(desc(candidateProfileVersions.versionNumber))
              .limit(1)
          : [];
      context.profileVersionId = retainedProfile?.id ?? crypto.randomUUID();
      context.steps[node.id] = {
        status: "completed",
        attempts: context.steps[node.id]?.attempts ?? 1,
        completedAt: now,
        outcome: "approved",
        note: "Approved by reviewer",
      };
      await getDb().batch([
        guard(),
        ...(telegramConnection
          ? [
              getDb()
                .update(telegramConnections)
                .set({
                  candidateId: candidate.id,
                  confirmedCandidateId: candidate.id,
                  confirmedBy: ownerEmail,
                  confirmedAt: now,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(telegramConnections.id, telegramConnection.id),
                    eq(telegramConnections.ownerEmail, ownerEmail),
                  ),
                ),
            ]
          : []),
        ...(retainedProfile
          ? []
          : [
              getDb()
                .update(candidates)
                .set(storedChanges)
                .where(
                  and(
                    eq(candidates.id, candidate.id),
                    eq(candidates.ownerEmail, ownerEmail),
                  ),
                ),
              getDb()
                .insert(candidateProfileVersions)
                .values({
                  id: context.profileVersionId,
                  ownerEmail,
                  candidateId: candidate.id,
                  resumeId: resume.id,
                  extractionId: extraction?.id ?? null,
                  versionNumber: (latest?.version ?? 0) + 1,
                  schemaVersion: 2,
                  profileJson: JSON.stringify(
                    candidateProfileFromSummary(context.approvedCandidate!),
                  ),
                  verificationStatus: "verified",
                  source: "workflow_hr_review",
                  createdByEmail: ownerEmail,
                  createdAt: now,
                  verifiedAt: now,
                }),
              getDb()
                .update(resumes)
                .set({
                  status: "ready",
                  verificationStatus: "verified",
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(resumes.id, resume.id),
                    eq(resumes.ownerEmail, ownerEmail),
                  ),
                ),
            ]),
        getDb()
          .update(workflowRuns)
          .set({
            contextJson: JSON.stringify(context),
            status: "queued",
            currentNodeId: nextNode(graph, node.id, "approved"),
            passwordHash,
            lockToken: null,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(
            and(eq(workflowRuns.id, row.id), eq(workflowRuns.lockToken, token)),
          ),
        workflowAudit(ownerEmail, "workflow.review_approved", row.id, {
          resumeId: resume.id,
          profileVersionId: context.profileVersionId,
        }),
      ]);
    } else {
      await getDb().batch([
        guard(),
        getDb()
          .update(candidates)
          .set(storedChanges)
          .where(
            and(
              eq(candidates.id, candidate.id),
              eq(candidates.ownerEmail, ownerEmail),
            ),
          ),
        getDb()
          .update(resumes)
          .set({ verificationStatus: "unverified", updatedAt: now })
          .where(eq(resumes.id, resume.id)),
        getDb()
          .update(workflowRuns)
          .set({
            status: "waiting_review",
            lockToken: null,
            lockedUntil: null,
            updatedAt: now,
          })
          .where(
            and(eq(workflowRuns.id, row.id), eq(workflowRuns.lockToken, token)),
          ),
        workflowAudit(ownerEmail, "workflow.review_saved", row.id),
      ]);
    }
    committed = true;
  } finally {
    if (!committed)
      await getDb()
        .update(workflowRuns)
        .set({ status: "waiting_review", lockToken: null, lockedUntil: null })
        .where(
          and(eq(workflowRuns.id, row.id), eq(workflowRuns.lockToken, token)),
        );
  }
}
