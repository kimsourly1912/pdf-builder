import { notArchived } from "@/features/archive/archive";
import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  candidates,
  candidateProfileVersions,
  recipientProfiles,
  resumes,
  user,
} from "@/db/schema";
import { candidateSummary } from "@/features/resumes/resume.server";
import { getReviewData, reviewRun } from "./review.server";
import { WorkflowStepError } from "./workflow-errors";
import type { ResumeEditorApproval } from "./workflow";

// Verification belongs to a specific CV and candidate revision, not an email match.
export async function verifiedResume(owner: string, resumeId: string) {
  const [row] = await getDb()
    .select({
      resume: resumes,
      candidate: candidates,
      profile: candidateProfileVersions,
    })
    .from(resumes)
    .innerJoin(
      candidates,
      and(
        eq(candidates.id, resumes.candidateId),
        eq(candidates.ownerEmail, owner),
      ),
    )
    .innerJoin(
      candidateProfileVersions,
      and(
        eq(candidateProfileVersions.resumeId, resumes.id),
        eq(candidateProfileVersions.candidateId, candidates.id),
        eq(candidateProfileVersions.ownerEmail, owner),
        eq(candidateProfileVersions.createdByEmail, owner),
        eq(candidateProfileVersions.verificationStatus, "verified"),
        sql`${candidateProfileVersions.createdAt}>=${candidates.updatedAt}`,
        sql`${candidateProfileVersions.createdAt}>=${resumes.updatedAt}`,
      ),
    )
    .where(
      and(
        eq(resumes.id, resumeId),
        eq(resumes.ownerEmail, owner),
        notArchived("resume", resumes.id),
        eq(resumes.verificationStatus, "verified"),
        eq(candidates.verificationStatus, "verified"),
        sql`${resumes.duplicateCandidateId} IS NULL`,
      ),
    )
    .orderBy(desc(candidateProfileVersions.versionNumber))
    .limit(1);
  if (!row || !row.candidate.fullName.trim() || !row.candidate.normalizedEmail)
    return null;
  return {
    ...row,
    proof: {
      resumeRevision: row.resume.updatedAt,
      candidateRevision: row.candidate.updatedAt,
      profileVersionId: row.profile.id,
      existingAccountId: row.candidate.userId ?? undefined,
    } satisfies ResumeEditorApproval,
  };
}

export async function existingVerifiedAccount(owner: string, email: string) {
  const [account] = await getDb()
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .innerJoin(
      recipientProfiles,
      and(
        eq(recipientProfiles.userId, user.id),
        eq(recipientProfiles.createdByEmail, owner),
        eq(recipientProfiles.accountType, "candidate"),
      ),
    )
    .where(and(eq(user.email, email), eq(user.banned, false)))
    .limit(1);
  return account ?? null;
}

export async function approveResumeEditorRun(owner: string, id: string) {
  const data = await getReviewData(owner, id),
    proof = data.run.context.resumeEditorApproval;
  if (!proof || !data.run.graph.nodes.some((n) => n.kind === "send_telegram"))
    return false;
  const verified = await verifiedResume(owner, data.run.resumeId);
  if (
    !verified ||
    verified.proof.resumeRevision !== proof.resumeRevision ||
    verified.proof.candidateRevision !== proof.candidateRevision ||
    verified.proof.profileVersionId !== proof.profileVersionId
  )
    throw new WorkflowStepError(
      "The verified CV changed. Verify it again in the Resume Editor.",
    );
  const existing = await existingVerifiedAccount(
    owner,
    verified.candidate.normalizedEmail,
  );
  if (existing && proof.existingAccountId !== existing.id) return false; // Explicit account reuse is still required.
  await reviewRun(owner, id, {
    action: "approve",
    candidate: candidateSummary(verified.candidate),
    checks: [true, true, true],
    resumeRevision: proof.resumeRevision,
    candidateRevision: proof.candidateRevision,
    existingAccountId: proof.existingAccountId,
    telegramConnectionId: data.run.context.telegramConnectionId,
    confirmTelegram: !!data.run.context.telegramConnectionId,
    note: "CV approved and verified in the Resume Editor.",
  });
  return true;
}
