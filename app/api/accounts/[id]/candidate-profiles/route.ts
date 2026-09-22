import {
  and,
  count,
  desc,
  eq,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  candidateProfileVersions,
  candidates,
  recipientProfiles,
  resumes,
} from "@/db/schema";
import type { CandidateProfileOption } from "@/features/accounts/account.types";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

const MAX_PAGE_SIZE = 25;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id: userId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const page = positiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(
      positiveInteger(searchParams.get("pageSize"), 20),
      MAX_PAGE_SIZE,
    );
    const search = searchParams.get("search")?.trim().slice(0, 120) ?? "";
    const db = getDb();
    const [account] = await db.select({ userId: recipientProfiles.userId })
      .from(recipientProfiles)
      .where(and(
        eq(recipientProfiles.userId, userId),
        eq(recipientProfiles.createdByEmail, ownerEmail),
      ))
      .limit(1);
    if (!account) return jsonError("Recipient account not found.", 404);

    const conditions: SQL[] = [
      eq(candidateProfileVersions.ownerEmail, ownerEmail),
      eq(candidates.ownerEmail, ownerEmail),
    ];
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(or(
        like(candidates.fullName, pattern),
        like(candidates.email, pattern),
        like(candidates.phone, pattern),
        like(candidates.currentTitle, pattern),
        like(resumes.fileName, pattern),
        like(resumes.appliedPosition, pattern),
      )!);
    }

    const baseQuery = db
      .select({
        id: candidateProfileVersions.id,
        candidateId: candidates.id,
        candidateName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
        currentTitle: candidates.currentTitle,
        versionNumber: candidateProfileVersions.versionNumber,
        verificationStatus: candidateProfileVersions.verificationStatus,
        fileName: resumes.fileName,
        appliedPosition: resumes.appliedPosition,
        receivedDate: resumes.receivedDate,
        createdAt: candidateProfileVersions.createdAt,
        candidateUserId: candidates.userId,
      })
      .from(candidateProfileVersions)
      .innerJoin(
        candidates,
        and(
          eq(candidateProfileVersions.candidateId, candidates.id),
          eq(candidateProfileVersions.ownerEmail, candidates.ownerEmail),
        ),
      )
      .leftJoin(
        resumes,
        and(
          eq(candidateProfileVersions.resumeId, resumes.id),
          eq(resumes.ownerEmail, ownerEmail),
        ),
      )
      .where(and(...conditions));

    const [rows, totals] = await Promise.all([
      baseQuery
        .orderBy(
          desc(sql<number>`case when ${candidateProfileVersions.verificationStatus} = 'verified' then 1 else 0 end`),
          desc(candidateProfileVersions.createdAt),
          desc(candidateProfileVersions.id),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(candidateProfileVersions)
        .innerJoin(
          candidates,
          and(
            eq(candidateProfileVersions.candidateId, candidates.id),
            eq(candidateProfileVersions.ownerEmail, candidates.ownerEmail),
          ),
        )
        .leftJoin(
          resumes,
          and(
            eq(candidateProfileVersions.resumeId, resumes.id),
            eq(resumes.ownerEmail, ownerEmail),
          ),
        )
        .where(and(...conditions)),
    ]);

    const items: CandidateProfileOption[] = rows.map((row) => ({
      id: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      email: row.email,
      phone: row.phone,
      currentTitle: row.currentTitle,
      versionNumber: row.versionNumber,
      verificationStatus: row.verificationStatus === "verified"
        ? "verified"
        : "extracted",
      fileName: row.fileName ?? "",
      appliedPosition: row.appliedPosition ?? "",
      receivedDate: row.receivedDate ?? null,
      createdAt: row.createdAt,
      linkedToAccount: row.candidateUserId === userId,
    }));
    const totalItems = totals[0]?.total ?? 0;
    return Response.json({
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to search candidate profiles", error);
    return jsonError("Candidate profiles could not be loaded.", 500);
  }
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}
