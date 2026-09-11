import { and, desc, eq, gte, inArray, like, lte, or, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { candidateResumeLinks, candidates, resumeExtractions, resumeProcessingJobs, resumes } from "@/db/schema";
import { normalizeEmail, normalizePhone } from "@/features/resumes/resume-extraction";
import {
  candidateInsertFromExtraction,
  candidateSummary,
  emptyCandidateInsert,
  parseResumeExtraction,
  resumeStatusForExtraction,
  safeResumeFileName,
  safeResumeInput,
  validDateOnly,
} from "@/features/resumes/resume.server";
import { MAX_RESUME_BYTES, MAX_RESUME_PAGES, isResumeStatus } from "@/features/resumes/resume.types";
import type { ResumeSummary } from "@/features/resumes/resume.types";
import { inspectPdf } from "@/features/templates/file-validation";
import { getFilesBucket, isResponse, jsonError, requireRequestOwner } from "@/features/templates/template.server";

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().slice(0, 120) ?? "";
    const source = url.searchParams.get("source")?.trim() ?? "";
    const statusValue = url.searchParams.get("status")?.trim() ?? "";
    const receivedFrom = url.searchParams.get("receivedFrom")?.trim() ?? "";
    const receivedTo = url.searchParams.get("receivedTo")?.trim() ?? "";
    const conditions: SQL[] = [eq(resumes.ownerEmail, ownerEmail)];
    if (source) conditions.push(eq(resumes.source, source));
    if (statusValue && isResumeStatus(statusValue)) conditions.push(eq(resumes.status, statusValue));
    if (validDateOnly(receivedFrom)) conditions.push(gte(resumes.receivedDate, receivedFrom));
    if (validDateOnly(receivedTo)) conditions.push(lte(resumes.receivedDate, receivedTo));
    if (search) {
      const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(or(
        like(resumes.fileName, pattern),
        like(resumes.appliedPosition, pattern),
        like(candidates.fullName, pattern),
        like(candidates.email, pattern),
        like(candidates.phone, pattern),
      )!);
    }
    const rows = await getDb()
      .select({ resume: resumes, candidate: candidates })
      .from(resumes)
      .leftJoin(candidates, eq(resumes.candidateId, candidates.id))
      .where(and(...conditions))
      .orderBy(desc(resumes.receivedDate), desc(resumes.createdAt))
      .limit(100);
    const duplicateIds = [...new Set(rows.map((row) => row.resume.duplicateCandidateId).filter((id): id is string => Boolean(id)))];
    const duplicateRows = duplicateIds.length > 0
      ? await getDb().select().from(candidates).where(and(eq(candidates.ownerEmail, ownerEmail), inArray(candidates.id, duplicateIds)))
      : [];
    const duplicates = new Map(duplicateRows.map((row) => [row.id, row]));
    const items: ResumeSummary[] = rows.map((row) => ({
      id: row.resume.id,
      fileName: row.resume.fileName,
      fileSize: row.resume.fileSize,
      pageCount: row.resume.pageCount,
      source: row.resume.source as ResumeSummary["source"],
      appliedPosition: row.resume.appliedPosition,
      receivedDate: row.resume.receivedDate,
      status: row.resume.status as ResumeSummary["status"],
      candidate: candidateSummary(row.candidate),
      duplicateCandidate: candidateSummary(row.resume.duplicateCandidateId ? duplicates.get(row.resume.duplicateCandidateId) ?? null : null),
      createdAt: row.resume.createdAt,
      updatedAt: row.resume.updatedAt,
    }));
    const stats = {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      needsAttention: items.filter((item) => item.status === "needs_attention" || item.status === "failed").length,
      possibleDuplicates: items.filter((item) => item.status === "possible_duplicate").length,
    };
    return Response.json({ items, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list resumes", error);
    return jsonError("Resumes could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  let fileKey: string | null = null;
  try {
    const ownerEmail = await requireRequestOwner(request);
    const formData = await request.formData();
    const input = safeResumeInput(formData);
    if (!input.ok) return jsonError(input.message, 400);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_RESUME_BYTES || file.type !== "application/pdf") {
      return jsonError("Choose a PDF file up to 15 MB.", 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>;
    const inspected = await inspectPdf(bytes);
    if (!inspected || inspected.pageCount > MAX_RESUME_PAGES) {
      return jsonError("The PDF is invalid, password-protected, or longer than 20 pages.", 422);
    }
    const extractionText = formData.get("extraction");
    let extraction = null;
    if (typeof extractionText === "string" && extractionText.length <= 500_000) {
      try { extraction = parseResumeExtraction(JSON.parse(extractionText) as unknown); } catch { extraction = null; }
    }
    if (extraction && extraction.pageCount !== inspected.pageCount) {
      return jsonError("The extracted page count does not match the PDF.", 422);
    }
    const extractionFailed = formData.get("extractionFailed") === "true";
    if (!extraction && !extractionFailed) return jsonError("Resume extraction data is invalid.", 422);

    const checksum = await sha256(bytes);
    const existing = await getDb().select({ id: resumes.id }).from(resumes).where(and(eq(resumes.ownerEmail, ownerEmail), eq(resumes.checksum, checksum))).limit(1);
    if (existing[0]) return jsonError("This PDF is already in the Resume Library.", 409);

    const email = extraction?.fields.emails.value?.[0] ?? "";
    const phone = extraction?.fields.phones.value?.[0] ?? "";
    const matches: SQL[] = [];
    if (email) matches.push(eq(candidates.normalizedEmail, normalizeEmail(email)));
    if (phone) matches.push(eq(candidates.normalizedPhone, normalizePhone(phone)));
    const duplicate = matches.length > 0
      ? (await getDb().select().from(candidates).where(and(eq(candidates.ownerEmail, ownerEmail), or(...matches))).limit(1))[0] ?? null
      : null;

    const resumeId = crypto.randomUUID();
    const candidateId = !duplicate ? crypto.randomUUID() : null;
    const now = new Date().toISOString();
    const status = resumeStatusForExtraction(extraction, Boolean(duplicate), extractionFailed);
    fileKey = `resumes/${resumeId}/original.pdf`;
    await getFilesBucket().put(fileKey, bytes.buffer, { httpMetadata: { contentType: "application/pdf" } });
    const db = getDb();
    const statements = [];
    if (candidateId) {
      statements.push(db.insert(candidates).values(
        extraction
          ? candidateInsertFromExtraction(extraction, { id: candidateId, ownerEmail, now })
          : emptyCandidateInsert({ id: candidateId, ownerEmail, now }),
      ));
    }
    statements.push(db.insert(resumes).values({
      id: resumeId, ownerEmail, candidateId, duplicateCandidateId: duplicate?.id ?? null,
      fileKey, fileName: safeResumeFileName(file.name), fileSize: file.size,
      contentType: "application/pdf", checksum, pageCount: inspected.pageCount,
      source: input.source, appliedPosition: input.appliedPosition,
      receivedDate: input.receivedDate, note: input.note, status,
      errorMessage: extractionFailed ? "Text extraction failed. Retry or review the PDF manually." : null,
      createdAt: now, updatedAt: now,
    }));
    if (extraction) {
      statements.push(db.insert(resumeExtractions).values({
        id: crypto.randomUUID(), resumeId, versionNumber: 1, engine: extraction.engine,
        status: status === "failed" ? "failed" : "completed", fieldsJson: JSON.stringify(extraction),
        pageCount: extraction.pageCount, scannedPageCount: extraction.scannedPageCount,
        createdByEmail: ownerEmail, createdAt: now,
      }));
    }
    if (candidateId) {
      statements.push(db.insert(candidateResumeLinks).values({
        id: crypto.randomUUID(), candidateId, resumeId, linkType: "automatic",
        createdByEmail: ownerEmail, createdAt: now,
      }));
    }
    statements.push(db.insert(resumeProcessingJobs).values({
      id: crypto.randomUUID(), resumeId, attemptNumber: 1,
      status: extractionFailed ? "failed" : "completed",
      errorCode: extractionFailed ? "TEXT_EXTRACTION_FAILED" : null,
      startedAt: now, completedAt: now, createdAt: now,
    }));
    await db.batch(statements as [typeof statements[number], ...typeof statements]);
    return Response.json({ resume: { id: resumeId, status } }, { status: 201 });
  } catch (error) {
    if (fileKey) await getFilesBucket().delete(fileKey).catch(() => undefined);
    if (isResponse(error)) return error;
    console.error("Failed to upload resume", error);
    const duplicate = error instanceof Error && /unique|constraint/iu.test(error.message);
    return jsonError(duplicate ? "This PDF is already in the Resume Library." : "The resume could not be uploaded.", duplicate ? 409 : 500);
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
