import { and, desc, eq, ne, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
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
import { normalizeEmail, normalizePhone } from "@/features/resumes/resume-extraction";
import {
  extractResumeWithOpenAi,
  ResumeExtractionProviderError,
} from "@/features/resumes/openai-resume-extraction.server";
import {
  candidateInsertFromExtraction,
  parseResumeExtraction,
  resumeStatusForExtraction,
} from "@/features/resumes/resume.server";
import type { ResumeExtractionPayloadV1 } from "@/features/resumes/resume.types";
import { sha256Hex } from "@/features/templates/submission-artifact";
import {
  getFilesBucket,
  isResponse,
  jsonError,
} from "@/features/templates/template.server";

export async function analyzeResumeForOwner(
  request: Request,
  ownerEmail: string,
  id: string,
) {
  try {
    const db = getDb();
    const [resume] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail)))
      .limit(1);
    if (!resume) return jsonError("Resume not found.", 404);

    const [latestExtraction] = await db
      .select()
      .from(resumeExtractions)
      .where(eq(resumeExtractions.resumeId, resume.id))
      .orderBy(desc(resumeExtractions.versionNumber))
      .limit(1);
    const [latestJob] = await db
      .select({ attemptNumber: resumeProcessingJobs.attemptNumber })
      .from(resumeProcessingJobs)
      .where(eq(resumeProcessingJobs.resumeId, resume.id))
      .orderBy(desc(resumeProcessingJobs.attemptNumber))
      .limit(1);
    const nextAttempt = (latestJob?.attemptNumber ?? 0) + 1;
    const nextExtractionVersion = (latestExtraction?.versionNumber ?? 0) + 1;
    const stored = latestExtraction
      ? parseStoredExtraction(latestExtraction.fieldsJson)
      : null;
    if (!stored) {
      return jsonError(
        "This resume has no readable extraction to use as a fallback.",
        422,
      );
    }

    const object = await getFilesBucket().get(resume.fileKey);
    if (!object) return jsonError("Resume PDF not found.", 404);
    const bytes = new Uint8Array(
      await new Response(object.body).arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    if ((await sha256Hex(bytes)) !== resume.checksum) {
      return jsonError("The resume PDF failed integrity verification.", 409);
    }

    const fallback: ResumeExtractionPayloadV1 = {
      schemaVersion: 1,
      engine: "pdf-text-heuristic-v1",
      pageCount: stored.pageCount,
      scannedPageCount: stored.scannedPageCount,
      totalCharacters: stored.totalCharacters,
      fields: stored.fields,
    };

    let extraction;
    try {
      extraction = await extractResumeWithOpenAi({
        bytes,
        fileName: resume.fileName,
        pageCount: resume.pageCount,
        fallback,
      });
    } catch (error) {
      const code = error instanceof ResumeExtractionProviderError
        ? error.code
        : "AI_PROVIDER_FAILED";
      const now = new Date().toISOString();
      await db.batch([
        db.insert(resumeProcessingJobs).values({
          id: crypto.randomUUID(),
          resumeId: resume.id,
          attemptNumber: nextAttempt,
          status: "failed",
          errorCode: code,
          startedAt: now,
          completedAt: now,
          createdAt: now,
        }),
        db.update(resumes).set({
          status: "needs_attention",
          errorMessage: "AI analysis could not be completed. The previous extraction is still available.",
          updatedAt: now,
        }).where(and(eq(resumes.id, resume.id), eq(resumes.ownerEmail, ownerEmail))),
      ]);
      console.error("Resume AI analysis failed", { resumeId: resume.id, code });
      return jsonError(
        code === "AI_NOT_CONFIGURED"
          ? "AI resume analysis is not configured yet."
          : "AI resume analysis is temporarily unavailable.",
        code === "AI_NOT_CONFIGURED" ? 503 : 502,
      );
    }

    const email = extraction.fields.emails.value?.[0] ?? "";
    const phone = extraction.fields.phones.value?.[0] ?? "";
    const matches: SQL[] = [];
    if (email) matches.push(eq(candidates.normalizedEmail, normalizeEmail(email)));
    if (phone) matches.push(eq(candidates.normalizedPhone, normalizePhone(phone)));
    const duplicate = matches.length > 0
      ? (await db.select().from(candidates).where(and(
          eq(candidates.ownerEmail, ownerEmail),
          resume.candidateId ? ne(candidates.id, resume.candidateId) : undefined,
          or(...matches),
        )).limit(1))[0] ?? null
      : null;

    const now = new Date().toISOString();
    const extractionId = crypto.randomUUID();
    let candidateId = resume.candidateId;
    const statements = [];
    if (!candidateId && !duplicate) {
      candidateId = crypto.randomUUID();
      statements.push(db.insert(candidates).values(
        candidateInsertFromExtraction(extraction, {
          id: candidateId,
          ownerEmail,
          now,
        }),
      ));
    }
    if (candidateId && resume.candidateId) {
      const [candidate] = await db.select().from(candidates).where(and(
        eq(candidates.id, candidateId),
        eq(candidates.ownerEmail, ownerEmail),
      )).limit(1);
      if (candidate?.verificationStatus !== "verified") {
        const next = candidateInsertFromExtraction(extraction, {
          id: candidate.id,
          ownerEmail,
          now,
        });
        statements.push(db.update(candidates).set({
          fullName: next.fullName,
          firstName: next.firstName,
          lastName: next.lastName,
          email: next.email,
          normalizedEmail: next.normalizedEmail,
          phone: next.phone,
          normalizedPhone: next.normalizedPhone,
          address: next.address,
          dateOfBirth: next.dateOfBirth,
          gender: next.gender,
          nationality: next.nationality,
          currentTitle: next.currentTitle,
          professionalSummary: next.professionalSummary,
          skillsJson: next.skillsJson,
          workExperienceJson: next.workExperienceJson,
          educationJson: next.educationJson,
          certificationsJson: next.certificationsJson,
          languagesJson: next.languagesJson,
          linksJson: next.linksJson,
          updatedAt: now,
        }).where(and(
          eq(candidates.id, candidate.id),
          eq(candidates.ownerEmail, ownerEmail),
        )));
      }
    }

    statements.push(db.insert(resumeExtractions).values({
      id: extractionId,
      resumeId: resume.id,
      versionNumber: nextExtractionVersion,
      engine: extraction.engine,
      status: "completed",
      fieldsJson: JSON.stringify(extraction),
      pageCount: extraction.pageCount,
      scannedPageCount: extraction.scannedPageCount,
      createdByEmail: ownerEmail,
      createdAt: now,
    }));

    if (candidateId) {
      const [latestProfile] = await db.select({
        versionNumber: candidateProfileVersions.versionNumber,
      }).from(candidateProfileVersions).where(and(
        eq(candidateProfileVersions.ownerEmail, ownerEmail),
        eq(candidateProfileVersions.candidateId, candidateId),
      )).orderBy(desc(candidateProfileVersions.versionNumber)).limit(1);
      statements.push(db.insert(candidateProfileVersions).values({
        id: crypto.randomUUID(),
        ownerEmail,
        candidateId,
        resumeId: resume.id,
        extractionId,
        versionNumber: (latestProfile?.versionNumber ?? 0) + 1,
        schemaVersion: 2,
        profileJson: JSON.stringify(extraction.profile),
        verificationStatus: "extracted",
        source: extraction.engine,
        createdByEmail: ownerEmail,
        createdAt: now,
      }));
    }
    if (candidateId && !resume.candidateId) {
      statements.push(db.insert(candidateResumeLinks).values({
        id: crypto.randomUUID(),
        candidateId,
        resumeId: resume.id,
        linkType: "automatic",
        createdByEmail: ownerEmail,
        createdAt: now,
      }));
    }
    const status = resumeStatusForExtraction(extraction, Boolean(duplicate), false);
    statements.push(db.insert(resumeProcessingJobs).values({
      id: crypto.randomUUID(),
      resumeId: resume.id,
      attemptNumber: nextAttempt,
      status: "completed",
      errorCode: null,
      startedAt: now,
      completedAt: now,
      createdAt: now,
    }));
    statements.push(db.update(resumes).set({
      candidateId,
      duplicateCandidateId: duplicate?.id ?? null,
      status,
      verificationStatus: status === "ready" ? "unverified" : "needs_attention",
      errorMessage: null,
      updatedAt: now,
    }).where(and(eq(resumes.id, resume.id), eq(resumes.ownerEmail, ownerEmail))));
    statements.push(db.insert(auditEvents).values(createAuditEvent({
      request,
      ownerEmail,
      actorType: "owner",
      actorId: ownerEmail,
      action: "resume.ai_analyzed",
      targetType: "resume",
      targetId: resume.id,
      metadata: {
        extractionVersion: nextExtractionVersion,
        engine: extraction.engine,
        status,
      },
      createdAt: now,
    })));
    await db.batch(statements as [typeof statements[number], ...typeof statements]);
    return Response.json({ resume: { id: resume.id, status } });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to analyze resume", error);
    return jsonError("The resume could not be analyzed.", 500);
  }
}

function parseStoredExtraction(value: string) {
  try {
    return parseResumeExtraction(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}
