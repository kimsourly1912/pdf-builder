import { notArchived } from "@/features/archive/archive";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

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
import {
  createPageMeta,
  parsePageQuery,
} from "@/features/pagination/pagination";
import {
  normalizeEmail,
  normalizePhone,
} from "@/features/resumes/resume-extraction";
import {
  extractResumeWithOpenAi,
  ResumeExtractionProviderError,
} from "@/features/resumes/openai-resume-extraction.server";
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
import {
  MAX_RESUME_BYTES,
  MAX_RESUME_PAGES,
  isResumeExtractionStatus,
  isResumeVerificationStatus,
} from "@/features/resumes/resume.types";
import type {
  ResumeExtractionPayload,
  ResumeExtractionPayloadV1,
  ResumeSummary,
} from "@/features/resumes/resume.types";
import { inspectPdf } from "@/features/templates/file-validation";
import {
  getFilesBucket,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { compensateStorageWrites } from "@/features/storage/storage-cleanup.server";

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().slice(0, 120) ?? "";
    const source = url.searchParams.get("source")?.trim() ?? "";
    const extractionStatusValue =
      url.searchParams.get("extractionStatus")?.trim() ?? "";
    const verificationStatusValue =
      url.searchParams.get("verificationStatus")?.trim() ?? "";
    const possibleDuplicate =
      url.searchParams.get("possibleDuplicate") === "true";
    const receivedFrom = url.searchParams.get("receivedFrom")?.trim() ?? "";
    const receivedTo = url.searchParams.get("receivedTo")?.trim() ?? "";
    const pageQuery = parsePageQuery(url.searchParams, {
      sorts: ["receivedDate", "createdAt", "updatedAt", "fileName"] as const,
      defaultSort: "receivedDate",
    });
    const conditions: SQL[] = [
      eq(resumes.ownerEmail, ownerEmail),
      notArchived("resume", resumes.id),
    ];
    if (source) conditions.push(eq(resumes.source, source));
    const latestJobStatus = sql<string>`coalesce((select job.status from resume_processing_jobs job where job.resume_id = ${resumes.id} order by job.attempt_number desc limit 1), 'queued')`;
    if (
      extractionStatusValue &&
      isResumeExtractionStatus(extractionStatusValue)
    )
      conditions.push(sql`${latestJobStatus} = ${extractionStatusValue}`);
    if (
      verificationStatusValue &&
      isResumeVerificationStatus(verificationStatusValue)
    )
      conditions.push(eq(resumes.verificationStatus, verificationStatusValue));
    if (possibleDuplicate)
      conditions.push(sql`${resumes.duplicateCandidateId} is not null`);
    if (validDateOnly(receivedFrom))
      conditions.push(gte(resumes.receivedDate, receivedFrom));
    if (validDateOnly(receivedTo))
      conditions.push(lte(resumes.receivedDate, receivedTo));
    if (search) {
      const pattern = `%${search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(
        or(
          like(resumes.fileName, pattern),
          like(resumes.appliedPosition, pattern),
          like(candidates.fullName, pattern),
          like(candidates.email, pattern),
          like(candidates.phone, pattern),
        )!,
      );
    }
    const sortColumn = {
      receivedDate: resumes.receivedDate,
      createdAt: resumes.createdAt,
      updatedAt: resumes.updatedAt,
      fileName: resumes.fileName,
    }[pageQuery.sort];
    const direction = pageQuery.order === "asc" ? asc : desc;
    const db = getDb();
    const [rows, totals] = await Promise.all([
      db
        .select({
          resume: resumes,
          candidate: candidates,
          extractionStatus: latestJobStatus,
        })
        .from(resumes)
        .leftJoin(candidates, eq(resumes.candidateId, candidates.id))
        .where(and(...conditions))
        .orderBy(direction(sortColumn), direction(resumes.id))
        .limit(pageQuery.pageSize)
        .offset(pageQuery.offset),
      db
        .select({
          total: count(),
          verified: sql<number>`sum(case when ${resumes.verificationStatus} = 'verified' then 1 else 0 end)`,
          needsAttention: sql<number>`sum(case when ${resumes.verificationStatus} = 'needs_attention' then 1 else 0 end)`,
          possibleDuplicates: sql<number>`sum(case when ${resumes.duplicateCandidateId} is not null then 1 else 0 end)`,
        })
        .from(resumes)
        .leftJoin(candidates, eq(resumes.candidateId, candidates.id))
        .where(and(...conditions)),
    ]);
    const duplicateIds = [
      ...new Set(
        rows
          .map((row) => row.resume.duplicateCandidateId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const duplicateRows =
      duplicateIds.length > 0
        ? await db
            .select()
            .from(candidates)
            .where(
              and(
                eq(candidates.ownerEmail, ownerEmail),
                inArray(candidates.id, duplicateIds),
              ),
            )
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
      extractionStatus: isResumeExtractionStatus(row.extractionStatus)
        ? row.extractionStatus
        : "queued",
      verificationStatus: row.resume
        .verificationStatus as ResumeSummary["verificationStatus"],
      candidate: candidateSummary(row.candidate),
      duplicateCandidate: candidateSummary(
        row.resume.duplicateCandidateId
          ? (duplicates.get(row.resume.duplicateCandidateId) ?? null)
          : null,
      ),
      createdAt: row.resume.createdAt,
      updatedAt: row.resume.updatedAt,
    }));
    const stats = {
      total: totals[0]?.total ?? 0,
      verified: totals[0]?.verified ?? 0,
      needsAttention: totals[0]?.needsAttention ?? 0,
      possibleDuplicates: totals[0]?.possibleDuplicates ?? 0,
    };
    return Response.json(
      { items, stats, ...createPageMeta(stats.total, pageQuery) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
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
    if (
      !(file instanceof File) ||
      file.size === 0 ||
      file.size > MAX_RESUME_BYTES ||
      file.type !== "application/pdf"
    ) {
      return jsonError("Choose a PDF file up to 15 MB.", 400);
    }
    const bytes = new Uint8Array(
      await file.arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    const inspected = await inspectPdf(bytes);
    if (!inspected || inspected.pageCount > MAX_RESUME_PAGES) {
      return jsonError(
        "The PDF is invalid, password-protected, or longer than 20 pages.",
        422,
      );
    }
    const extractionText = formData.get("extraction");
    let extraction: ResumeExtractionPayload | null = null;
    if (
      typeof extractionText === "string" &&
      extractionText.length <= 500_000
    ) {
      try {
        const parsed = parseResumeExtraction(
          JSON.parse(extractionText) as unknown,
        );
        extraction = parsed?.schemaVersion === 1 ? parsed : null;
      } catch {
        extraction = null;
      }
    }
    if (extraction && extraction.pageCount !== inspected.pageCount) {
      return jsonError("The extracted page count does not match the PDF.", 422);
    }
    const clientExtractionFailed = formData.get("extractionFailed") === "true";
    if (!extraction && !clientExtractionFailed) {
      return jsonError("Resume extraction data is invalid.", 422);
    }

    const checksum = await sha256(bytes);
    const existing = await getDb()
      .select({ id: resumes.id })
      .from(resumes)
      .where(
        and(eq(resumes.ownerEmail, ownerEmail), eq(resumes.checksum, checksum)),
      )
      .limit(1);
    if (existing[0])
      return jsonError("This PDF is already in the Resume Library.", 409);

    let aiErrorCode: string | null = null;
    if (extraction?.schemaVersion === 1) {
      try {
        extraction = await extractResumeWithOpenAi({
          bytes,
          fileName: file.name,
          pageCount: inspected.pageCount,
          fallback: extraction as ResumeExtractionPayloadV1,
        });
      } catch (error) {
        aiErrorCode =
          error instanceof ResumeExtractionProviderError
            ? error.code
            : "AI_PROVIDER_FAILED";
      }
    }
    const extractionFailed = !extraction && clientExtractionFailed;
    const email = extraction?.fields.emails.value?.[0] ?? "";
    const phone = extraction?.fields.phones.value?.[0] ?? "";
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
              .where(and(eq(candidates.ownerEmail, ownerEmail), or(...matches)))
              .limit(1)
          )[0] ?? null)
        : null;

    const resumeId = crypto.randomUUID();
    const candidateId = !duplicate ? crypto.randomUUID() : null;
    const now = new Date().toISOString();
    const status = resumeStatusForExtraction(
      extraction,
      Boolean(duplicate),
      extractionFailed,
    );
    const extractionId = extraction ? crypto.randomUUID() : null;
    fileKey = `resumes/${resumeId}/original.pdf`;
    await getFilesBucket().put(fileKey, bytes.buffer, {
      httpMetadata: { contentType: "application/pdf" },
    });
    const db = getDb();
    const statements = [];
    if (candidateId) {
      statements.push(
        db
          .insert(candidates)
          .values(
            extraction
              ? candidateInsertFromExtraction(extraction, {
                  id: candidateId,
                  ownerEmail,
                  now,
                })
              : emptyCandidateInsert({ id: candidateId, ownerEmail, now }),
          ),
      );
    }
    statements.push(
      db.insert(resumes).values({
        id: resumeId,
        ownerEmail,
        candidateId,
        duplicateCandidateId: duplicate?.id ?? null,
        fileKey,
        fileName: safeResumeFileName(file.name),
        fileSize: file.size,
        contentType: "application/pdf",
        checksum,
        pageCount: inspected.pageCount,
        source: input.source,
        appliedPosition: input.appliedPosition,
        receivedDate: input.receivedDate,
        note: input.note,
        status,
        verificationStatus:
          status === "ready" ? "unverified" : "needs_attention",
        errorMessage: extractionFailed
          ? "Text extraction failed. Retry or review the PDF manually."
          : null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    if (extraction) {
      statements.push(
        db.insert(resumeExtractions).values({
          id: extractionId!,
          resumeId,
          versionNumber: 1,
          engine: extraction.engine,
          status: status === "failed" ? "failed" : "completed",
          fieldsJson: JSON.stringify(extraction),
          pageCount: extraction.pageCount,
          scannedPageCount: extraction.scannedPageCount,
          createdByEmail: ownerEmail,
          createdAt: now,
        }),
      );
    }
    if (candidateId && extraction?.schemaVersion === 2 && extractionId) {
      statements.push(
        db.insert(candidateProfileVersions).values({
          id: crypto.randomUUID(),
          ownerEmail,
          candidateId,
          resumeId,
          extractionId,
          versionNumber: 1,
          schemaVersion: 2,
          profileJson: JSON.stringify(extraction.profile),
          verificationStatus: "extracted",
          source: extraction.engine,
          createdByEmail: ownerEmail,
          createdAt: now,
        }),
      );
    }
    if (candidateId) {
      statements.push(
        db.insert(candidateResumeLinks).values({
          id: crypto.randomUUID(),
          candidateId,
          resumeId,
          linkType: "automatic",
          createdByEmail: ownerEmail,
          createdAt: now,
        }),
      );
    }
    statements.push(
      db.insert(resumeProcessingJobs).values({
        id: crypto.randomUUID(),
        resumeId,
        attemptNumber: 1,
        status: extractionFailed ? "failed" : "completed",
        errorCode: extractionFailed ? "TEXT_EXTRACTION_FAILED" : aiErrorCode,
        startedAt: now,
        completedAt: now,
        createdAt: now,
      }),
    );
    statements.push(
      db.insert(auditEvents).values(
        createAuditEvent({
          request,
          ownerEmail,
          actorType: "owner",
          actorId: ownerEmail,
          action: "resume.uploaded",
          targetType: "resume",
          targetId: resumeId,
          metadata: {
            pageCount: inspected.pageCount,
            source: input.source,
            status,
            extractionEngine: extraction?.engine ?? null,
            aiFallbackUsed: Boolean(aiErrorCode && extraction),
          },
          createdAt: now,
        }),
      ),
    );
    // Persist trigger runs atomically with the uploaded resume.
    const { uploadWorkflowStatements } = await import(
      "@/features/workflows/workflow.server"
    );
    const workflowStatements = await uploadWorkflowStatements(
      ownerEmail,
      resumeId,
      now,
    );
    await db.batch([...statements, ...workflowStatements] as [
      (typeof statements)[number] | (typeof workflowStatements)[number],
      ...((typeof statements)[number] | (typeof workflowStatements)[number])[],
    ]);
    return Response.json({ resume: { id: resumeId, status } }, { status: 201 });
  } catch (error) {
    if (fileKey) {
      await compensateStorageWrites([fileKey], "resume_create_failed");
    }
    if (isResponse(error)) return error;
    console.error("Failed to upload resume", error);
    const duplicate =
      error instanceof Error && /unique|constraint/iu.test(error.message);
    return jsonError(
      duplicate
        ? "This PDF is already in the Resume Library."
        : "The resume could not be uploaded.",
      duplicate ? 409 : 500,
    );
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
