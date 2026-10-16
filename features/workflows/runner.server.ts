import { notArchived } from "@/features/archive/archive";
import { approveResumeEditorRun } from "./verified-resume.server";
import { deliverWorkflowInvitation } from "@/features/telegram/delivery.server";
import { TelegramSendError } from "@/features/telegram/bot.server";
import "server-only";
import { processApplicationRouting } from "@/features/hiring/automation.server";

import { and, desc, eq, isNull, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  account,
  candidates,
  candidateProfileVersions,
  formAssignments,
  recipientLinks,
  recipientProfiles,
  resumeExtractions,
  resumes,
  templates,
  templateVersions,
  user,
} from "@/db/schema";
import {
  availableProfileKeys,
  buildAssignmentPrefillStorage,
  mappedAutomaticFieldIds,
} from "@/features/accounts/assignment-prefill";
import { normalizeCandidateProfile } from "@/features/resumes/candidate-profile";
import { buildCandidatePrefillSnapshot } from "@/features/resumes/candidate-prefill";
import { MAX_RESUME_PAGES } from "@/features/resumes/resume.types";
import {
  createRecipientToken,
  hashRecipientToken,
} from "@/features/templates/template.server";
import { parseVersionRoles } from "@/features/templates/template-write";
import type { TemplateAnnotation } from "@/features/templates/template.types";
import { workflowRuns, workflowExecutionGuards } from "./schema";
import { claimRun, workflowAudit } from "./workflow.server";
import {
  conditionMatches,
  nextNode,
  type RunContext,
  type RunStatus,
  type WorkflowGraph,
} from "./workflow";
import { WorkflowStepError, workflowErrorMessage } from "./workflow-errors";

type RunRow = typeof workflowRuns.$inferSelect;

export async function processWorkflowRun(id: string): Promise<void> {
  const [available] = await getDb()
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        eq(workflowRuns.id, id),
        notArchived("workflow_run", workflowRuns.id),
        notArchived("resume", workflowRuns.resumeId),
      ),
    )
    .limit(1);
  if (!available) return;
  const claim = await claimRun(id);
  if (!claim) return;
  let row = claim.row;
  const token = claim.token;
  if (row.eventId) return processApplicationRouting(row, token);
  const graph = JSON.parse(row.graphJson) as WorkflowGraph;
  const context = JSON.parse(row.contextJson) as RunContext;
  let nodeId = row.currentNodeId;
  try {
    for (let remaining = 0; remaining < 32; remaining++) {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node)
        throw new WorkflowStepError("The saved workflow step is unavailable.");
      const [resume] = await getDb()
        .select()
        .from(resumes)
        .where(
          and(
            eq(resumes.id, row.resumeId),
            eq(resumes.ownerEmail, row.ownerEmail),
          ),
        )
        .limit(1);
      if (!resume)
        throw new WorkflowStepError(
          "This resume was removed. This workflow cannot continue.",
        );
      const attempts = (context.steps[nodeId]?.attempts ?? 0) + 1;
      const startedAt =
        context.steps[nodeId]?.startedAt ?? new Date().toISOString();
      context.steps[nodeId] = { status: "waiting", attempts, startedAt };
      let outcome: "next" | "yes" | "no" = "next";
      let note: string | undefined;
      if (node.kind === "review_resume") {
        context.reviewStartedAt ??= new Date().toISOString();
        await checkpoint(row, token, context, nodeId, "waiting_review");
        if (
          context.resumeEditorApproval &&
          (await approveResumeEditorRun(row.ownerEmail, row.id))
        ) {
          await processWorkflowRun(row.id);
        }
        return;
      }
      if (node.kind === "complete" || node.kind === "stop") {
        if (node.kind === "complete" && !context.rejection)
          context.preparationCompletedAt ??= new Date().toISOString();
        context.steps[nodeId] = {
          status: "completed",
          attempts,
          startedAt,
          completedAt: new Date().toISOString(),
        };
        await checkpoint(
          row,
          token,
          context,
          nodeId,
          context.rejection ? "rejected" : "completed",
          true,
        );
        return;
      }
      const next = () => nextNode(graph, nodeId, outcome);
      if (node.kind === "send_telegram") {
        const outcome = await deliverWorkflowInvitation(
          row,
          token,
          context,
          nodeId,
          node.config,
        );
        if (outcome === "waiting") {
          context.steps[nodeId] = {
            status: "waiting",
            attempts,
            startedAt,
            note:
              context.waitingFor === "telegram_retry"
                ? "Telegram delivery will retry."
                : "Waiting for a confirmed Telegram connection or bot configuration.",
          };
          await checkpoint(row, token, context, nodeId, "queued");
          return;
        }
        note = "Invitation accepted by Telegram (not a read receipt)";
      }
      if (node.kind === "extract_resume") {
        const [extraction] = await getDb()
          .select()
          .from(resumeExtractions)
          .where(eq(resumeExtractions.resumeId, resume.id))
          .orderBy(desc(resumeExtractions.versionNumber))
          .limit(1);
        note =
          extraction?.status === "completed"
            ? "Saved extraction is available. AI processing is optional."
            : "Manual CV review is available without AI extraction.";
      }
      if (node.kind === "condition") {
        outcome = conditionMatches(node.config, resume) ? "yes" : "no";
        note =
          outcome === "yes" ? "Condition matched" : "Condition did not match";
      }
      if (node.kind === "create_account") {
        if (
          !context.candidateId ||
          !context.reviewedName ||
          !context.reviewedEmail
        )
          throw new WorkflowStepError(
            "Approved candidate details are unavailable. Review this resume again.",
          );
        if (context.userId) {
          const [existing] = await getDb()
            .select({ id: user.id })
            .from(user)
            .innerJoin(recipientProfiles, eq(user.id, recipientProfiles.userId))
            .where(
              and(
                eq(user.id, context.userId),
                eq(user.email, context.reviewedEmail),
                eq(recipientProfiles.createdByEmail, row.ownerEmail),
                eq(recipientProfiles.accountType, "candidate"),
                eq(user.banned, false),
              ),
            )
            .limit(1);
          if (!existing)
            throw new WorkflowStepError(
              "The reviewed candidate account is unavailable.",
            );
          note = "Used reviewed existing account";
        } else {
          if (!row.passwordHash)
            throw new WorkflowStepError(
              "Set a temporary password during review before creating an account.",
            );
          const userId = `wf_${row.id}`;
          const now = new Date();
          const existing = await getDb()
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, context.reviewedEmail))
            .limit(1);
          if (existing.length)
            throw new WorkflowStepError(
              "An account with this email already exists. Return to review and explicitly select that account.",
            );
          const accountContext = structuredClone(context);
          accountContext.userId = userId;
          accountContext.steps[nodeId] = {
            status: "completed",
            attempts,
            startedAt,
            completedAt: now.toISOString(),
            note: "Candidate account created",
          };
          await getDb().batch([
            executionGuard(row, token),
            getDb().insert(user).values({
              id: userId,
              name: context.reviewedName,
              email: context.reviewedEmail,
              role: "user",
              emailVerified: false,
              createdAt: now,
              updatedAt: now,
            }),
            getDb()
              .insert(account)
              .values({
                id: `wf_credential_${row.id}`,
                accountId: userId,
                providerId: "credential",
                userId,
                password: row.passwordHash,
                createdAt: now,
                updatedAt: now,
              }),
            getDb().insert(recipientProfiles).values({
              userId,
              accountType: "candidate",
              mustChangePassword: true,
              createdByEmail: row.ownerEmail,
              createdAt: now.toISOString(),
              updatedAt: now.toISOString(),
            }),
            progressQuery(row, token, accountContext, next(), "running", true),
            workflowAudit(row.ownerEmail, "workflow.account_created", row.id, {
              accountId: userId,
            }),
          ]);
          Object.assign(context, accountContext);
          nodeId = next();
          row = { ...row, passwordHash: null };
          continue;
        }
      }
      if (node.kind === "link_resume") {
        if (
          !context.userId ||
          !context.candidateId ||
          resume.candidateId !== context.candidateId
        )
          throw new WorkflowStepError(
            "The resume's candidate changed after approval. Return to review.",
          );
        const [candidate] = await getDb()
          .select()
          .from(candidates)
          .where(
            and(
              eq(candidates.id, context.candidateId),
              eq(candidates.ownerEmail, row.ownerEmail),
            ),
          )
          .limit(1);
        const [linked] = await getDb()
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(
              eq(candidates.ownerEmail, row.ownerEmail),
              eq(candidates.userId, context.userId),
            ),
          )
          .limit(1);
        if (
          !candidate ||
          (candidate.userId && candidate.userId !== context.userId) ||
          (linked && linked.id !== candidate.id)
        )
          throw new WorkflowStepError(
            "This candidate or account is already linked elsewhere. Resolve the link in Accounts before retrying.",
          );
        const now = new Date().toISOString();
        context.steps[nodeId] = {
          status: "completed",
          attempts,
          startedAt,
          completedAt: now,
          note: "Approved resume linked",
        };
        await getDb().batch([
          executionGuard(row, token),
          getDb()
            .update(candidates)
            .set({ userId: context.userId })
            .where(
              and(
                eq(candidates.id, candidate.id),
                eq(candidates.ownerEmail, row.ownerEmail),
              ),
            ),
          progressQuery(row, token, context, next(), "running"),
          workflowAudit(row.ownerEmail, "workflow.resume_linked", row.id, {
            candidateId: candidate.id,
            accountId: context.userId,
          }),
        ]);
        nodeId = next();
        continue;
      }
      if (node.kind === "assign_forms") {
        if (
          !context.userId ||
          !context.profileVersionId ||
          !context.candidateId
        )
          throw new WorkflowStepError(
            "Link the approved resume before assigning forms.",
          );
        const [profileRow] = await getDb()
          .select()
          .from(candidateProfileVersions)
          .where(
            and(
              eq(candidateProfileVersions.id, context.profileVersionId),
              eq(candidateProfileVersions.ownerEmail, row.ownerEmail),
              eq(candidateProfileVersions.candidateId, context.candidateId),
              eq(candidateProfileVersions.resumeId, row.resumeId),
              eq(candidateProfileVersions.verificationStatus, "verified"),
            ),
          )
          .limit(1);
        const [candidate] = await getDb()
          .select()
          .from(candidates)
          .where(
            and(
              eq(candidates.id, context.candidateId),
              eq(candidates.userId, context.userId),
              eq(candidates.ownerEmail, row.ownerEmail),
            ),
          )
          .limit(1);
        const [recipient] = await getDb()
          .select()
          .from(recipientProfiles)
          .where(
            and(
              eq(recipientProfiles.userId, context.userId),
              eq(recipientProfiles.createdByEmail, row.ownerEmail),
            ),
          )
          .limit(1);
        if (!profileRow || !candidate || !recipient)
          throw new WorkflowStepError(
            "Approved resume data or candidate linkage is unavailable.",
          );
        const profile = normalizeCandidateProfile(
          JSON.parse(profileRow.profileJson),
          MAX_RESUME_PAGES,
        );
        if (!profile)
          throw new WorkflowStepError(
            "The approved profile contains invalid data.",
          );
        for (const target of node.config.forms ?? []) {
          if (!target.versionId)
            throw new WorkflowStepError(
              "Publish this workflow with valid template selections.",
            );
          const key = `workflow-${await hashRecipientToken(`${row.id}:${nodeId}:${target.templateId}:${target.roleId}`)}`;
          const [existing] = await getDb()
            .select()
            .from(formAssignments)
            .where(
              and(
                eq(formAssignments.userId, context.userId),
                eq(formAssignments.templateVersionId, target.versionId),
                eq(formAssignments.roleId, target.roleId),
              ),
            )
            .limit(1);
          if (existing) {
            if (
              existing.assignmentRequestKey === key ||
              node.config.skipExisting !== false
            )
              continue;
            throw new WorkflowStepError(
              "This template version and role are already assigned. Enable Skip existing assignments or update the candidate's assignments.",
            );
          }
          const [targetRow] = await getDb()
            .select({ template: templates, version: templateVersions })
            .from(templates)
            .innerJoin(
              templateVersions,
              and(
                eq(templateVersions.templateId, templates.id),
                eq(templateVersions.id, target.versionId),
              ),
            )
            .where(
              and(
                eq(templates.id, target.templateId),
                eq(templates.ownerEmail, row.ownerEmail),
                isNull(templates.archivedAt),
              ),
            )
            .limit(1);
          const role =
            targetRow &&
            parseVersionRoles(targetRow.version.rolesJson).find(
              (r) => r.id === target.roleId,
            );
          if (!targetRow || !role)
            throw new WorkflowStepError(
              "A selected template was archived or its published role is unavailable.",
            );
          const annotations = JSON.parse(
            targetRow.version.annotationsJson,
          ) as TemplateAnnotation[];
          const approved = context.approvedCandidate;
          if (!approved)
            throw new WorkflowStepError(
              "The approved candidate snapshot is unavailable.",
            );
          const approvedRecord = {
            ...candidate,
            fullName: approved.fullName,
            email: approved.email,
            phone: approved.phone,
            address: approved.address,
            dateOfBirth: approved.dateOfBirth,
            gender: approved.gender,
            nationality: approved.nationality,
            currentTitle: approved.currentTitle,
            professionalSummary: approved.professionalSummary,
            skillsJson: JSON.stringify(approved.skills),
            workExperienceJson: JSON.stringify(approved.workExperience),
            educationJson: JSON.stringify(approved.education),
            certificationsJson: JSON.stringify(approved.certifications),
            languagesJson: JSON.stringify(approved.languages),
            linksJson: JSON.stringify(approved.links),
            firstName: profile.identity.firstName.value ?? "",
            lastName: profile.identity.lastName.value ?? "",
            verificationStatus: "verified",
          };
          const snapshot = buildCandidatePrefillSnapshot({
            candidate: approvedRecord,
            annotations,
            recipientRoleId: role.id,
            profileVersion: {
              id: profileRow.id,
              profile,
              verificationStatus: "verified",
            },
          });
          const storage = buildAssignmentPrefillStorage({
            mode: "automatic",
            snapshot,
            allowedFieldIds: mappedAutomaticFieldIds(snapshot),
            profile,
            allowedProfileKeys: availableProfileKeys(profile),
          });
          const now = new Date().toISOString();
          const linkId = crypto.randomUUID();
          const assignmentId = crypto.randomUUID();
          await getDb().batch([
            executionGuard(row, token),
            getDb()
              .insert(recipientLinks)
              .values({
                id: linkId,
                templateId: target.templateId,
                templateVersionId: target.versionId,
                roleId: role.id,
                roleName: role.name,
                roleColor: role.color,
                assignedUserId: context.userId,
                tokenHash: await hashRecipientToken(createRecipientToken()),
                status: "active",
                maxSubmissions: 1,
                submissionCount: 0,
                createdAt: now,
                updatedAt: now,
              }),
            getDb()
              .insert(formAssignments)
              .values({
                id: assignmentId,
                userId: context.userId,
                templateId: target.templateId,
                templateVersionId: target.versionId,
                recipientLinkId: linkId,
                roleId: role.id,
                roleName: role.name,
                roleColor: role.color,
                candidateProfileVersionId: profileRow.id,
                initialValuesJson: JSON.stringify(storage.initialValues),
                initialValuesMetaJson: JSON.stringify(storage.initialMetadata),
                availableValuesJson: JSON.stringify(storage.availableValues),
                availableValuesMetaJson: JSON.stringify(
                  storage.availableMetadata,
                ),
                prefillMode: "automatic",
                assignmentRequestKey: key,
                status: "assigned",
                assignedAt: now,
                updatedAt: now,
              }),
            workflowAudit(row.ownerEmail, "workflow.form_assigned", row.id, {
              assignmentId,
              templateId: target.templateId,
            }),
          ]);
        }
        note = "Forms assigned using approved resume mappings";
      }
      context.steps[nodeId] = {
        status: "completed",
        attempts,
        startedAt,
        completedAt: new Date().toISOString(),
        ...(note ? { note } : {}),
        outcome,
      };
      nodeId = next();
      await checkpoint(row, token, context, nodeId, "running");
    }
    throw new WorkflowStepError("This workflow exceeded its step limit.");
  } catch (error) {
    const message =
      error instanceof TelegramSendError
        ? error.message
        : workflowErrorMessage(error);
    context.steps[nodeId] = {
      ...context.steps[nodeId],
      status: "failed",
      attempts: context.steps[nodeId]?.attempts ?? 1,
    };
    await getDb()
      .update(workflowRuns)
      .set({
        status: "failed",
        currentNodeId: nodeId,
        contextJson: JSON.stringify(context),
        errorMessage: message,
        lockToken: null,
        lockedUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(workflowRuns.id, row.id), eq(workflowRuns.lockToken, token)),
      );
    await workflowAudit(row.ownerEmail, "workflow.failed", row.id, {
      stepId: nodeId,
    }).catch(() => undefined);
    console.error("Candidate workflow step failed", {
      runId: row.id,
      stepId: nodeId,
    });
  }
}

function progressQuery(
  row: RunRow,
  token: string,
  context: RunContext,
  currentNodeId: string,
  status: RunStatus,
  clearPassword = false,
) {
  const releasing = status !== "running";
  return getDb()
    .update(workflowRuns)
    .set({
      contextJson: JSON.stringify(context),
      currentNodeId,
      status,
      errorMessage: null,
      ...(clearPassword ? { passwordHash: null } : {}),
      ...(releasing ? { lockToken: null, lockedUntil: null } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(workflowRuns.id, row.id), eq(workflowRuns.lockToken, token)));
}
async function checkpoint(
  row: RunRow,
  token: string,
  context: RunContext,
  currentNodeId: string,
  status: RunStatus,
  clearPassword = false,
) {
  const updated = await progressQuery(
    row,
    token,
    context,
    currentNodeId,
    status,
    clearPassword,
  ).returning({ id: workflowRuns.id });
  if (!updated.length)
    throw new WorkflowStepError(
      "Another worker resumed this run. Refresh its progress.",
    );
}

export async function processPendingWorkflowRuns(options: { applicationOnly?: boolean } = {}) {
  const now = new Date().toISOString();
  const pending = await getDb()
    .select({ id: workflowRuns.id })
    .from(workflowRuns)
    .where(
      and(
        or(
          eq(workflowRuns.status, "queued"),
          eq(workflowRuns.status, "running"),
        ),
        notArchived("workflow_run", workflowRuns.id),
        notArchived("resume", workflowRuns.resumeId),
        options.applicationOnly ? isNotNull(workflowRuns.eventId) : undefined,
        or(isNull(workflowRuns.lockedUntil), lt(workflowRuns.lockedUntil, now)),
      ),
    )
    .orderBy(workflowRuns.createdAt)
    .limit(10);
  await Promise.allSettled(pending.map((r) => processWorkflowRun(r.id)));
}

function executionGuard(row: RunRow, token: string) {
  return getDb().insert(workflowExecutionGuards).values({
    runId: row.id,
    lockToken: token,
    checkedAt: new Date().toISOString(),
  });
}
