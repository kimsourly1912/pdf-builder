import { approvalPlan, approvalSnapshotSql } from "@/features/resumes/approval-plan.server";
import { validCandidateEmail } from "@/features/resumes/approval-plan";
import { getCvUpdate, decideCvUpdate } from "@/features/candidate-progress/cv-updates.server";
import { archiveEntity, isArchived } from "@/features/archive/archive.server";
import {
  telegramIntakes,
  telegramConnections,
} from "@/features/telegram/schema";
import { and, desc, eq, isNull, sql, ne, or, type SQL } from "drizzle-orm";

import { getDatabaseBinding, getDb } from "@/db";
import {
  auditEvents,
  candidateProfileVersions,
  candidateResumeLinks,
  candidates,
  resumeExtractions,
  resumeProcessingJobs,
  resumes,
} from "@/db/schema";
import { createAuditEvent } from "@/features/audit/audit.server";
import { candidateProfileFromSummary } from "@/features/resumes/candidate-profile";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/resumes/resume-extraction";
import {
  candidateInsertFromExtraction,
  candidateSummary,
  parseCandidateUpdate,
  parseResumeExtraction,
  resumeStatusForExtraction,
} from "@/features/resumes/resume.server";
import {
  isResumeExtractionStatus,
  type ResumeDetail,
} from "@/features/resumes/resume.types";
import { uploadWorkflowStatements } from "@/features/workflows/workflow.server";
import { workflowRuns } from "@/features/workflows/schema";
import type { RunContext } from "@/features/workflows/workflow";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const [row] = await getDb()
      .select({ resume: resumes, candidate: candidates })
      .from(resumes)
      .leftJoin(candidates, eq(resumes.candidateId, candidates.id))
      .where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail)))
      .limit(1);
    if (!row) return jsonError("Resume not found.", 404);
    const [extractionRow] = await getDb()
      .select()
      .from(resumeExtractions)
      .where(eq(resumeExtractions.resumeId, id))
      .orderBy(desc(resumeExtractions.versionNumber))
      .limit(1);
    const [latestJob] = await getDb()
      .select({ status: resumeProcessingJobs.status })
      .from(resumeProcessingJobs)
      .where(eq(resumeProcessingJobs.resumeId, id))
      .orderBy(desc(resumeProcessingJobs.attemptNumber))
      .limit(1);
    const duplicate = row.resume.duplicateCandidateId
      ? ((
          await getDb()
            .select()
            .from(candidates)
            .where(
              and(
                eq(candidates.id, row.resume.duplicateCandidateId),
                eq(candidates.ownerEmail, ownerEmail),
              ),
            )
            .limit(1)
        )[0] ?? null)
      : null;
    const [intake] = await getDb()
      .select({
        id: telegramIntakes.id,
        connectionId: telegramIntakes.connectionId,
      })
      .from(telegramIntakes)
      .where(
        and(
          eq(telegramIntakes.resumeId, id),
          eq(telegramIntakes.ownerEmail, ownerEmail),
        ),
      )
      .limit(1);
    const [contact] = intake
      ? await getDb()
          .select()
          .from(telegramConnections)
          .where(
            and(
              eq(telegramConnections.id, intake.connectionId),
              eq(telegramConnections.ownerEmail, ownerEmail),
            ),
          )
          .limit(1)
      : [];
    const cvUpdate = await getCvUpdate(ownerEmail, id);
    const updateDraft = cvUpdate ? parseCandidateUpdate(JSON.parse(cvUpdate.draftJson)) : null;
    const detail: ResumeDetail = {
      cvUpdate: cvUpdate && cvUpdate.status !== "replaced" ? {status: cvUpdate.status, revision: cvUpdate.updatedAt, baseResumeId: cvUpdate.baseResumeId, reason: cvUpdate.reason} : undefined,
      intakeId: intake?.id,
      candidateRevision: row.candidate?.updatedAt,
      archived: await isArchived("resume", id),
      telegramContact: contact
        ? {
            username: contact.username,
            confirmed:
              contact.confirmedCandidateId === row.resume.candidateId &&
              contact.confirmedBy === ownerEmail,
          }
        : undefined,
      id: row.resume.id,
      fileName: row.resume.fileName,
      fileSize: row.resume.fileSize,
      pageCount: row.resume.pageCount,
      source: row.resume.source as ResumeDetail["source"],
      appliedPosition: row.resume.appliedPosition,
      receivedDate: row.resume.receivedDate,
      note: row.resume.note,
      extractionStatus: isResumeExtractionStatus(latestJob?.status)
        ? latestJob.status
        : "queued",
      verificationStatus: row.resume
        .verificationStatus as ResumeDetail["verificationStatus"],
      candidate: updateDraft && row.candidate && cvUpdate?.status !== "replaced" ? {...updateDraft, id: row.candidate.id, verificationStatus: cvUpdate?.status === "accepted" ? "verified" : "extracted"} : candidateSummary(row.candidate),
      duplicateCandidate: candidateSummary(duplicate),
      extraction: extractionRow
        ? parseStoredExtraction(extractionRow.fieldsJson)
        : null,
      extractionVersion: extractionRow?.versionNumber ?? null,
      errorMessage: row.resume.errorMessage,
      createdAt: row.resume.createdAt,
      updatedAt: row.resume.updatedAt,
    };
    return Response.json(
      { resume: detail },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to load resume", error);
    return jsonError("The resume could not be loaded.", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return jsonError("Use the same site to review a CV.", 403);
    const body = (await request.json()) as Record<string, unknown>;
    const [resume] = await getDb()
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail)))
      .limit(1);
    if (!resume) return jsonError("Resume not found.", 404);
    if (await isArchived("resume", id))
      return jsonError("Restore this CV from Archive before editing it.", 409);
    const cvUpdate = await getCvUpdate(ownerEmail, id);
    if (cvUpdate && cvUpdate.status !== "replaced") {
      return Response.json(await decideCvUpdate(ownerEmail, id, body));
    }
    if (body.action === "link_candidate")
      return linkCandidate(ownerEmail, resume.id, body.candidateId);
    if (body.action === "retry_extraction")
      return saveRetry(ownerEmail, resume, body.extraction);
    if (
      !["update_candidate", "approve_cv", "save_changes"].includes(
        String(body.action),
      )
    )
      return jsonError("Choose a valid resume action.", 400);
    if (!resume.candidateId)
      return jsonError(
        "Link this resume to a candidate before editing it.",
        409,
      );
    if (body.candidate && typeof body.candidate === "object" && "email" in body.candidate && typeof body.candidate.email === "string" && body.candidate.email.trim() && !validCandidateEmail(body.candidate.email))
      return jsonError("Enter a valid email address.", 422);
    const update = parseCandidateUpdate(body.candidate);
    if (!update) return jsonError("Candidate information is invalid.", 422);
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
    if (!candidate) return jsonError("Candidate not found.", 404);
    if (
      body.resumeRevision !== undefined &&
      (body.resumeRevision !== resume.updatedAt ||
        body.candidateRevision !== candidate.updatedAt)
    )
      return jsonError(
        "This CV changed. Reload before saving your review.",
        409,
      );
    if (await isArchived("resume", id))
      return jsonError("Restore this CV from Archive before editing.", 409);
    const [intake] = await getDb()
      .select()
      .from(telegramIntakes)
      .where(
        and(
          eq(telegramIntakes.resumeId, id),
          eq(telegramIntakes.ownerEmail, ownerEmail),
        ),
      )
      .limit(1);
    const approving = body.action === "approve_cv";
    if (approving && (!update.fullName.trim() || !update.email))
      return jsonError(
        "Enter the candidate's full name and email before verifying.",
        422,
      );
    const [contact] = intake
      ? await getDb()
          .select()
          .from(telegramConnections)
          .where(
            and(
              eq(telegramConnections.id, intake.connectionId),
              eq(telegramConnections.ownerEmail, ownerEmail),
            ),
          )
          .limit(1)
      : [];
    const preview = approving && typeof body.approvalPlanRevision === "string"
      ? await approvalPlan(ownerEmail, id, candidate.id, update.email)
      : null;
    if (preview && preview.plan.revision !== body.approvalPlanRevision)
      return jsonError("Preparation setup or contact changed. Review a fresh approval summary.", 409);
    if (preview?.plan.workflows.length && preview.plan.existingAccount && !preview.plan.existingAccount.linked && body.existingAccountId !== preview.plan.existingAccount.id)
      return jsonError("Confirm reuse of the existing candidate account in the approval summary.", 422);
    if (preview?.plan.contact && contact && JSON.parse(preview.snapshot).contact.updatedAt !== contact.updatedAt)
      return jsonError("Telegram contact changed. Review a fresh approval summary.", 409);
    const now = new Date().toISOString();
    const nameParts = update.fullName.split(/\s+/u);
    const candidateUpdate = getDb()
      .update(candidates)
      .set({
        fullName: update.fullName,
        firstName: nameParts[0] ?? "",
        lastName: nameParts.slice(1).join(" "),
        email: update.email,
        normalizedEmail: update.email ? normalizeEmail(update.email) : "",
        phone: update.phone,
        normalizedPhone: update.phone ? normalizePhone(update.phone) : "",
        address: update.address,
        dateOfBirth: update.dateOfBirth,
        gender: update.gender,
        nationality: update.nationality,
        currentTitle: update.currentTitle,
        professionalSummary: update.professionalSummary,
        skillsJson: JSON.stringify(update.skills),
        workExperienceJson: JSON.stringify(update.workExperience),
        educationJson: JSON.stringify(update.education),
        certificationsJson: JSON.stringify(update.certifications),
        languagesJson: JSON.stringify(update.languages),
        linksJson: JSON.stringify(update.links),
        verificationStatus: approving ? "verified" : "unverified",
        updatedAt: now,
      })
      .where(
        and(
          eq(candidates.id, candidate.id),
          eq(candidates.ownerEmail, ownerEmail),
        ),
      );
    if (!approving && resume.verificationStatus === "verified" && body.confirmInvalidateApproval !== true)
      return jsonError("Saving these changes requires CV approval again. Existing preparation and submitted answers are preserved. Confirm before saving.", 409);
    if (!approving) {
      const binding = getDatabaseBinding();
      const queries = [
        candidateUpdate,
        getDb()
          .update(resumes)
          .set({
            verificationStatus: "unverified",
            status: resume.duplicateCandidateId
              ? "possible_duplicate"
              : "needs_attention",
            updatedAt: now,
          })
          .where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail))),
        getDb()
          .insert(auditEvents)
          .values(
            createAuditEvent({
              request,
              ownerEmail,
              actorType: "owner",
              actorId: ownerEmail,
              action: "candidate.changes_saved",
              targetType: "candidate",
              targetId: candidate.id,
              metadata: { resumeId: id },
              createdAt: now,
            }),
          ),
      ];
      await binding.batch([
        binding
          .prepare(
            "INSERT INTO resume_edit_guards(resume_id,owner_email,resume_revision,candidate_revision) VALUES(?,?,?,?)",
          )
          .bind(id, ownerEmail, resume.updatedAt, candidate.updatedAt),
        ...queries.map((q) => {
          const p = q.toSQL();
          return binding.prepare(p.sql).bind(...p.params);
        }),
      ]);
      return Response.json({ saved: true, approved: false });
    }
    const [latestExtraction] = await getDb()
      .select()
      .from(resumeExtractions)
      .where(eq(resumeExtractions.resumeId, resume.id))
      .orderBy(desc(resumeExtractions.versionNumber))
      .limit(1);
    const verifiedCandidate = candidateSummary({
      ...candidate,
      ...update,
      firstName: nameParts[0] ?? "",
      lastName: nameParts.slice(1).join(" "),
      normalizedEmail: update.email ? normalizeEmail(update.email) : "",
      normalizedPhone: update.phone ? normalizePhone(update.phone) : "",
      skillsJson: JSON.stringify(update.skills),
      workExperienceJson: JSON.stringify(update.workExperience),
      educationJson: JSON.stringify(update.education),
      certificationsJson: JSON.stringify(update.certifications),
      languagesJson: JSON.stringify(update.languages),
      linksJson: JSON.stringify(update.links),
      verificationStatus: "verified",
      updatedAt: now,
    });
    if (!verifiedCandidate) return jsonError("Candidate not found.", 404);
    const [latestProfile] = await getDb()
      .select({
        versionNumber: candidateProfileVersions.versionNumber,
      })
      .from(candidateProfileVersions)
      .where(
        and(
          eq(candidateProfileVersions.ownerEmail, ownerEmail),
          eq(candidateProfileVersions.candidateId, candidate.id),
        ),
      )
      .orderBy(desc(candidateProfileVersions.versionNumber))
      .limit(1);
    const profileVersion = (latestProfile?.versionNumber ?? 0) + 1,
      profileId = crypto.randomUUID();
    const confirmed =
      !!contact &&
      (body.confirmTelegram === true ||
        (contact.confirmedCandidateId === candidate.id &&
          contact.confirmedBy === ownerEmail));
    const initial: RunContext = {
      steps: {},
      resumeEditorApproval: {
        resumeRevision: now,
        candidateRevision: now,
        profileVersionId: profileId,
        existingAccountId: preview?.plan.existingAccount && (preview.plan.existingAccount.linked || body.existingAccountId === preview.plan.existingAccount.id) ? preview.plan.existingAccount.id : candidate.userId ?? undefined,
      },
      telegramConnectionId: confirmed && contact ? contact.id : undefined,
      telegramChatId: confirmed && contact ? contact.chatId : undefined,
    };
    const eventStatements = await uploadWorkflowStatements(
      ownerEmail,
      resume.id,
      now,
      "resume_verified",
      initial,
    );
    const pending = await getDb()
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.resumeId, resume.id),
          eq(workflowRuns.ownerEmail, ownerEmail),
          isNull(workflowRuns.applicationId), isNull(workflowRuns.eventId),
          sql`NOT EXISTS(SELECT 1 FROM hiring_applications a WHERE a.owner_email=${ownerEmail} AND a.resume_id=${resume.id} AND a.outcome IS NULL AND json_extract(a.evidence_json,'$.preparationMode')='application')`,
        ),
      );
    const continuation = pending
      .filter(
        (run) =>
          ["queued", "waiting_review", "failed"].includes(run.status) &&
          !(JSON.parse(run.contextJson) as RunContext).reviewedAt,
      )
      .map((run) =>
        getDb()
          .update(workflowRuns)
          .set({
            contextJson: JSON.stringify({
              ...JSON.parse(run.contextJson),
              ...initial,
              steps: (JSON.parse(run.contextJson) as RunContext).steps,
            }),
            status: "queued",
            errorMessage: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(workflowRuns.id, run.id),
              eq(workflowRuns.updatedAt, run.updatedAt),
              sql`NOT EXISTS(SELECT 1 FROM hiring_applications a WHERE a.owner_email=${ownerEmail} AND a.resume_id=${resume.id} AND a.outcome IS NULL AND json_extract(a.evidence_json,'$.preparationMode')='application')`,
            ),
          ),
      );
    const statements = [
      candidateUpdate,
      ...(confirmed && contact
        ? [
            getDb()
              .update(telegramConnections)
              .set({
                confirmedCandidateId: candidate.id,
                confirmedBy: ownerEmail,
                confirmedAt: now,
                updatedAt: now,
              })
              .where(eq(telegramConnections.id, contact.id)),
          ]
        : []),
      ...eventStatements,
      ...continuation,
      getDb()
        .insert(candidateProfileVersions)
        .values({
          id: profileId,
          ownerEmail,
          candidateId: candidate.id,
          resumeId: resume.id,
          extractionId: latestExtraction?.id ?? null,
          versionNumber: profileVersion,
          schemaVersion: 2,
          profileJson: JSON.stringify(
            candidateProfileFromSummary(verifiedCandidate),
          ),
          verificationStatus: "verified",
          source: "hr_review",
          createdByEmail: ownerEmail,
          createdAt: now,
          verifiedAt: now,
        }),
      getDb()
        .update(resumes)
        .set({
          status: "ready",
          verificationStatus: "verified",
          duplicateCandidateId: null,
          errorMessage: null,
          updatedAt: now,
        })
        .where(
          and(eq(resumes.id, resume.id), eq(resumes.ownerEmail, ownerEmail)),
        ),
      getDb()
        .insert(auditEvents)
        .values(
          createAuditEvent({
            request,
            ownerEmail,
            actorType: "owner",
            actorId: ownerEmail,
            action: "candidate.profile_verified",
            targetType: "candidate",
            targetId: candidate.id,
            metadata: { resumeId: resume.id, profileVersion },
            createdAt: now,
          }),
        ),
    ];
    const binding = getDatabaseBinding();
    await binding.batch([
      preview
        ? binding.prepare(`INSERT INTO resume_edit_guards(resume_id,owner_email,resume_revision,candidate_revision) VALUES(?2,?1,?4,CASE WHEN (${approvalSnapshotSql})=?5 THEN ?6 ELSE '' END)`)
            .bind(ownerEmail, resume.id, update.email.trim().toLowerCase(), resume.updatedAt, preview.snapshot, candidate.updatedAt)
        : binding.prepare("INSERT INTO resume_edit_guards(resume_id,owner_email,resume_revision,candidate_revision) VALUES(?,?,?,?)")
            .bind(resume.id, ownerEmail, resume.updatedAt, candidate.updatedAt),
      ...statements.map((q) => {
        const prepared = q.toSQL();
        return binding.prepare(prepared.sql).bind(...prepared.params);
      }),
    ]);
    let preparationRunIds: string[] = [];
    try {
      preparationRunIds = (await getDb().select({id:workflowRuns.id}).from(workflowRuns).where(and(eq(workflowRuns.ownerEmail,ownerEmail),eq(workflowRuns.resumeId,resume.id),isNull(workflowRuns.applicationId),isNull(workflowRuns.eventId),eq(workflowRuns.status,"queued")))).map(r=>r.id);
    } catch {
      // Approval already committed. Scheduled processing can recover queued runs.
      console.warn("Approval saved; immediate preparation scheduling deferred.");
    }
    return Response.json({ candidate: verifiedCandidate, approved: true, preparationRunIds });
  } catch (error) {
    if (isResponse(error)) return error;
    if (error instanceof Error && /RESUME_EDIT_CHANGED|CV_UPDATE_CHANGED/.test(error.message))
      return jsonError(
        "This CV changed while saving. Reload before trying again.",
        409,
      );
    console.error("Failed to update resume", error);
    const duplicate = error instanceof Error && /unique/iu.test(error.message);
    return jsonError(
      duplicate
        ? "That candidate account is already linked to another profile."
        : "The resume could not be updated.",
      duplicate ? 409 : 500,
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await requireRequestOwner(request),
      { id } = await context.params;
    await archiveEntity(owner, "resume", id);
    return Response.json({ archived: true });
  } catch (error) {
    if (isResponse(error)) return error;
    return jsonError("The CV could not be archived.", 500);
  }
}

async function linkCandidate(
  ownerEmail: string,
  resumeId: string,
  candidateIdValue: unknown,
) {
  const candidateId =
    typeof candidateIdValue === "string" ? candidateIdValue : "";
  if (!candidateId) return jsonError("Choose a candidate to link.", 400);
  const [candidate] = await getDb()
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.ownerEmail, ownerEmail),
      ),
    )
    .limit(1);
  if (!candidate) return jsonError("Candidate not found.", 404);
  const now = new Date().toISOString();
  const db = getDb();
  await db.batch([
    db
      .delete(candidateResumeLinks)
      .where(eq(candidateResumeLinks.resumeId, resumeId)),
    db.insert(candidateResumeLinks).values({
      id: crypto.randomUUID(),
      candidateId,
      resumeId,
      linkType: "manual",
      createdByEmail: ownerEmail,
      createdAt: now,
    }),
    db
      .update(resumes)
      .set({
        candidateId,
        duplicateCandidateId: null,
        status: "ready",
        verificationStatus: "unverified",
        errorMessage: null,
        updatedAt: now,
      })
      .where(and(eq(resumes.id, resumeId), eq(resumes.ownerEmail, ownerEmail))),
  ]);
  return Response.json({ candidate: candidateSummary(candidate) });
}

async function saveRetry(
  ownerEmail: string,
  resume: typeof resumes.$inferSelect,
  value: unknown,
) {
  const extraction = parseResumeExtraction(value);
  if (
    !extraction ||
    extraction.schemaVersion !== 1 ||
    extraction.pageCount !== resume.pageCount
  ) {
    return jsonError("Resume extraction data is invalid.", 422);
  }
  const [latest] = await getDb()
    .select({ versionNumber: resumeExtractions.versionNumber })
    .from(resumeExtractions)
    .where(eq(resumeExtractions.resumeId, resume.id))
    .orderBy(desc(resumeExtractions.versionNumber))
    .limit(1);
  const email = extraction.fields.emails.value?.[0] ?? "";
  const phone = extraction.fields.phones.value?.[0] ?? "";
  const matches: SQL[] = [];
  if (email)
    matches.push(eq(candidates.normalizedEmail, normalizeEmail(email)));
  if (phone)
    matches.push(eq(candidates.normalizedPhone, normalizePhone(phone)));
  const duplicate =
    matches.length > 0
      ? ((
          await getDb()
            .select()
            .from(candidates)
            .where(
              and(
                eq(candidates.ownerEmail, ownerEmail),
                resume.candidateId
                  ? ne(candidates.id, resume.candidateId)
                  : undefined,
                or(...matches),
              ),
            )
            .limit(1)
        )[0] ?? null)
      : null;
  const now = new Date().toISOString();
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const status = resumeStatusForExtraction(
    extraction,
    Boolean(duplicate),
    false,
  );
  const db = getDb();
  const statements = [];
  let candidateId = resume.candidateId;
  if (!candidateId && !duplicate) {
    candidateId = crypto.randomUUID();
    statements.push(
      db.insert(candidates).values(
        candidateInsertFromExtraction(extraction, {
          id: candidateId,
          ownerEmail,
          now,
        }),
      ),
    );
  }
  if (candidateId && resume.candidateId) {
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(
        and(
          eq(candidates.id, candidateId),
          eq(candidates.ownerEmail, ownerEmail),
        ),
      )
      .limit(1);
    if (candidate?.verificationStatus !== "verified") {
      const extracted = candidateInsertFromExtraction(extraction, {
        id: candidate.id,
        ownerEmail,
        now,
      });
      statements.push(
        db
          .update(candidates)
          .set({
            fullName: extracted.fullName,
            firstName: extracted.firstName,
            lastName: extracted.lastName,
            email: extracted.email,
            normalizedEmail: extracted.normalizedEmail,
            phone: extracted.phone,
            normalizedPhone: extracted.normalizedPhone,
            address: extracted.address,
            dateOfBirth: extracted.dateOfBirth,
            gender: extracted.gender,
            nationality: extracted.nationality,
            currentTitle: extracted.currentTitle,
            professionalSummary: extracted.professionalSummary,
            skillsJson: extracted.skillsJson,
            workExperienceJson: extracted.workExperienceJson,
            educationJson: extracted.educationJson,
            certificationsJson: extracted.certificationsJson,
            languagesJson: extracted.languagesJson,
            linksJson: extracted.linksJson,
            updatedAt: now,
          })
          .where(
            and(
              eq(candidates.id, candidate.id),
              eq(candidates.ownerEmail, ownerEmail),
            ),
          ),
      );
    }
  }
  statements.push(
    db.insert(resumeExtractions).values({
      id: crypto.randomUUID(),
      resumeId: resume.id,
      versionNumber,
      engine: extraction.engine,
      status: "completed",
      fieldsJson: JSON.stringify(extraction),
      pageCount: extraction.pageCount,
      scannedPageCount: extraction.scannedPageCount,
      createdByEmail: ownerEmail,
      createdAt: now,
    }),
  );
  if (candidateId && !resume.candidateId) {
    statements.push(
      db.insert(candidateResumeLinks).values({
        id: crypto.randomUUID(),
        candidateId,
        resumeId: resume.id,
        linkType: "automatic",
        createdByEmail: ownerEmail,
        createdAt: now,
      }),
    );
  }
  statements.push(
    db.insert(resumeProcessingJobs).values({
      id: crypto.randomUUID(),
      resumeId: resume.id,
      attemptNumber: versionNumber,
      status: "completed",
      startedAt: now,
      completedAt: now,
      createdAt: now,
    }),
  );
  statements.push(
    db
      .update(resumes)
      .set({
        candidateId,
        duplicateCandidateId: duplicate?.id ?? null,
        status,
        verificationStatus:
          status === "ready" ? "unverified" : "needs_attention",
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(eq(resumes.id, resume.id), eq(resumes.ownerEmail, ownerEmail)),
      ),
  );
  await db.batch(
    statements as [(typeof statements)[number], ...typeof statements],
  );
  return Response.json({ resume: { id: resume.id, status } });
}

function parseStoredExtraction(value: string) {
  try {
    return parseResumeExtraction(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}
