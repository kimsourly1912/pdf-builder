import { and, desc, eq, ne, or, type SQL } from "drizzle-orm";

import { getDatabaseBinding, getDb } from "@/db";
import {
  candidateResumeLinks,
  candidates,
  resumeExtractions,
  resumeProcessingJobs,
  resumes,
} from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/features/resumes/resume-extraction";
import {
  candidateInsertFromExtraction,
  candidateSummary,
  parseCandidateUpdate,
  parseResumeExtraction,
  resumeStatusForExtraction,
  updateExtractionWithVerifiedCandidate,
} from "@/features/resumes/resume.server";
import type { ResumeDetail } from "@/features/resumes/resume.types";
import { processStorageCleanupJobs } from "@/features/storage/storage-cleanup.server";
import { isResponse, jsonError, requireRequestOwner } from "@/features/templates/template.server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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
    const [extractionRow] = await getDb().select().from(resumeExtractions)
      .where(eq(resumeExtractions.resumeId, id))
      .orderBy(desc(resumeExtractions.versionNumber)).limit(1);
    const duplicate = row.resume.duplicateCandidateId
      ? (await getDb().select().from(candidates).where(and(eq(candidates.id, row.resume.duplicateCandidateId), eq(candidates.ownerEmail, ownerEmail))).limit(1))[0] ?? null
      : null;
    const detail: ResumeDetail = {
      id: row.resume.id,
      fileName: row.resume.fileName,
      fileSize: row.resume.fileSize,
      pageCount: row.resume.pageCount,
      source: row.resume.source as ResumeDetail["source"],
      appliedPosition: row.resume.appliedPosition,
      receivedDate: row.resume.receivedDate,
      note: row.resume.note,
      status: row.resume.status as ResumeDetail["status"],
      candidate: candidateSummary(row.candidate),
      duplicateCandidate: candidateSummary(duplicate),
      extraction: extractionRow ? parseStoredExtraction(extractionRow.fieldsJson) : null,
      extractionVersion: extractionRow?.versionNumber ?? null,
      errorMessage: row.resume.errorMessage,
      createdAt: row.resume.createdAt,
      updatedAt: row.resume.updatedAt,
    };
    return Response.json({ resume: detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to load resume", error);
    return jsonError("The resume could not be loaded.", 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const [resume] = await getDb().select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail))).limit(1);
    if (!resume) return jsonError("Resume not found.", 404);
    if (body.action === "link_candidate") return linkCandidate(ownerEmail, resume.id, body.candidateId);
    if (body.action === "retry_extraction") return saveRetry(ownerEmail, resume, body.extraction);
    if (body.action !== "update_candidate") return jsonError("Choose a valid resume action.", 400);
    if (!resume.candidateId) return jsonError("Link this resume to a candidate before editing it.", 409);
    const update = parseCandidateUpdate(body.candidate);
    if (!update) return jsonError("Candidate information is invalid.", 422);
    const [candidate] = await getDb().select().from(candidates).where(and(eq(candidates.id, resume.candidateId), eq(candidates.ownerEmail, ownerEmail))).limit(1);
    if (!candidate) return jsonError("Candidate not found.", 404);
    const now = new Date().toISOString();
    const nameParts = update.fullName.split(/\s+/u);
    await getDb().update(candidates).set({
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
      verificationStatus: "verified",
      updatedAt: now,
    }).where(and(eq(candidates.id, candidate.id), eq(candidates.ownerEmail, ownerEmail)));
    const [latestExtraction] = await getDb().select().from(resumeExtractions)
      .where(eq(resumeExtractions.resumeId, resume.id))
      .orderBy(desc(resumeExtractions.versionNumber)).limit(1);
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
    const extraction = latestExtraction ? parseStoredExtraction(latestExtraction.fieldsJson) : null;
    if (latestExtraction && extraction && verifiedCandidate) {
      await getDb().update(resumeExtractions).set({ fieldsJson: JSON.stringify(updateExtractionWithVerifiedCandidate(extraction, verifiedCandidate, ownerEmail)) })
        .where(eq(resumeExtractions.id, latestExtraction.id));
    }
    await getDb().update(resumes).set({ status: "ready", duplicateCandidateId: null, errorMessage: null, updatedAt: now })
      .where(and(eq(resumes.id, resume.id), eq(resumes.ownerEmail, ownerEmail)));
    return Response.json({ candidate: verifiedCandidate });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to update resume", error);
    const duplicate = error instanceof Error && /unique|constraint/iu.test(error.message);
    return jsonError(duplicate ? "That candidate account is already linked to another profile." : "The resume could not be updated.", duplicate ? 409 : 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const [resume] = await getDb().select().from(resumes).where(and(eq(resumes.id, id), eq(resumes.ownerEmail, ownerEmail))).limit(1);
    if (!resume) return jsonError("Resume not found.", 404);
    const database = getDatabaseBinding();
    const now = new Date().toISOString();
    const results = await database.batch([
      database
        .prepare(
          `INSERT OR IGNORE INTO storage_cleanup_jobs (
            id, object_key, reason, attempt_count, last_error_code,
            created_at, updated_at
          )
          SELECT ?, file_key, 'resume_deleted', 0, NULL, ?, ?
          FROM resumes
          WHERE id = ? AND owner_email = ?`,
        )
        .bind(crypto.randomUUID(), now, now, id, ownerEmail),
      database
        .prepare("DELETE FROM resumes WHERE id = ? AND owner_email = ?")
        .bind(id, ownerEmail),
    ]);
    if (Number(results[1]?.meta?.changes ?? 0) === 0) {
      return jsonError("Resume not found.", 404);
    }
    await processStorageCleanupJobs({ objectKeys: [resume.fileKey] }).catch(
      () => undefined,
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to delete resume", error);
    return jsonError("The resume could not be deleted.", 500);
  }
}

async function linkCandidate(ownerEmail: string, resumeId: string, candidateIdValue: unknown) {
  const candidateId = typeof candidateIdValue === "string" ? candidateIdValue : "";
  if (!candidateId) return jsonError("Choose a candidate to link.", 400);
  const [candidate] = await getDb().select().from(candidates).where(and(eq(candidates.id, candidateId), eq(candidates.ownerEmail, ownerEmail))).limit(1);
  if (!candidate) return jsonError("Candidate not found.", 404);
  const now = new Date().toISOString();
  const db = getDb();
  await db.batch([
    db.delete(candidateResumeLinks).where(eq(candidateResumeLinks.resumeId, resumeId)),
    db.insert(candidateResumeLinks).values({ id: crypto.randomUUID(), candidateId, resumeId, linkType: "manual", createdByEmail: ownerEmail, createdAt: now }),
    db.update(resumes).set({ candidateId, duplicateCandidateId: null, status: "ready", errorMessage: null, updatedAt: now }).where(and(eq(resumes.id, resumeId), eq(resumes.ownerEmail, ownerEmail))),
  ]);
  return Response.json({ candidate: candidateSummary(candidate) });
}

async function saveRetry(ownerEmail: string, resume: typeof resumes.$inferSelect, value: unknown) {
  const extraction = parseResumeExtraction(value);
  if (!extraction || extraction.pageCount !== resume.pageCount) return jsonError("Resume extraction data is invalid.", 422);
  const [latest] = await getDb().select({ versionNumber: resumeExtractions.versionNumber }).from(resumeExtractions)
    .where(eq(resumeExtractions.resumeId, resume.id)).orderBy(desc(resumeExtractions.versionNumber)).limit(1);
  const email = extraction.fields.emails.value?.[0] ?? "";
  const phone = extraction.fields.phones.value?.[0] ?? "";
  const matches: SQL[] = [];
  if (email) matches.push(eq(candidates.normalizedEmail, normalizeEmail(email)));
  if (phone) matches.push(eq(candidates.normalizedPhone, normalizePhone(phone)));
  const duplicate = matches.length > 0
    ? (await getDb().select().from(candidates).where(and(eq(candidates.ownerEmail, ownerEmail), resume.candidateId ? ne(candidates.id, resume.candidateId) : undefined, or(...matches))).limit(1))[0] ?? null
    : null;
  const now = new Date().toISOString();
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const status = resumeStatusForExtraction(extraction, Boolean(duplicate), false);
  const db = getDb();
  const statements = [];
  let candidateId = resume.candidateId;
  if (!candidateId && !duplicate) {
    candidateId = crypto.randomUUID();
    statements.push(db.insert(candidates).values(candidateInsertFromExtraction(extraction, { id: candidateId, ownerEmail, now })));
  }
  if (candidateId && resume.candidateId) {
    const [candidate] = await db.select().from(candidates).where(and(eq(candidates.id, candidateId), eq(candidates.ownerEmail, ownerEmail))).limit(1);
    if (candidate?.verificationStatus !== "verified") {
      const extracted = candidateInsertFromExtraction(extraction, { id: candidate.id, ownerEmail, now });
      statements.push(db.update(candidates).set({
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
      }).where(and(eq(candidates.id, candidate.id), eq(candidates.ownerEmail, ownerEmail))));
    }
  }
  statements.push(db.insert(resumeExtractions).values({
    id: crypto.randomUUID(), resumeId: resume.id, versionNumber, engine: extraction.engine,
    status: "completed", fieldsJson: JSON.stringify(extraction), pageCount: extraction.pageCount,
    scannedPageCount: extraction.scannedPageCount, createdByEmail: ownerEmail, createdAt: now,
  }));
  if (candidateId && !resume.candidateId) {
    statements.push(db.insert(candidateResumeLinks).values({ id: crypto.randomUUID(), candidateId, resumeId: resume.id, linkType: "automatic", createdByEmail: ownerEmail, createdAt: now }));
  }
  statements.push(db.insert(resumeProcessingJobs).values({ id: crypto.randomUUID(), resumeId: resume.id, attemptNumber: versionNumber, status: "completed", startedAt: now, completedAt: now, createdAt: now }));
  statements.push(db.update(resumes).set({ candidateId, duplicateCandidateId: duplicate?.id ?? null, status, errorMessage: null, updatedAt: now }).where(and(eq(resumes.id, resume.id), eq(resumes.ownerEmail, ownerEmail))));
  await db.batch(statements as [typeof statements[number], ...typeof statements]);
  return Response.json({ resume: { id: resume.id, status } });
}

function parseStoredExtraction(value: string) {
  try { return parseResumeExtraction(JSON.parse(value) as unknown); } catch { return null; }
}
