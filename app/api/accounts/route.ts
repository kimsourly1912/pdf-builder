import { and, asc, count, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDb } from "@/db";
import {
  auditEvents,
  candidateProfileVersions,
  candidates,
  formAssignments,
  recipientLinks,
  recipientProfiles,
  resumes,
  templates,
  templateVersions,
  user,
} from "@/db/schema";
import { createAuditEvent } from "@/features/audit/audit.server";
import { createPageMeta, parsePageQuery } from "@/features/pagination/pagination";
import { normalizeEmail } from "@/features/resumes/resume-extraction";
import { toUtcIsoString } from "@/features/templates/date-time";
import {
  isRecipientAccountType,
} from "@/features/accounts/account.types";
import { isStrongAccountPassword } from "@/features/accounts/account-share";
import type {
  RecipientAccountSummary,
  RecipientAssignmentSummary,
} from "@/features/accounts/account.types";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";
import { getAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const searchParams = new URL(request.url).searchParams;
    const pageQuery = parsePageQuery(searchParams, {
      sorts: ["createdAt", "name", "email"] as const,
      defaultSort: "createdAt",
    });
    const conditions: SQL[] = [
      eq(recipientProfiles.createdByEmail, ownerEmail),
    ];
    const accountType = searchParams.get("accountType");
    if (isRecipientAccountType(accountType)) {
      conditions.push(eq(recipientProfiles.accountType, accountType));
    }
    const search = searchParams.get("search")?.trim().slice(0, 120);
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(or(like(user.name, pattern), like(user.email, pattern))!);
    }
    const sortColumn = {
      createdAt: recipientProfiles.createdAt,
      name: user.name,
      email: user.email,
    }[pageQuery.sort];
    const direction = pageQuery.order === "asc" ? asc : desc;
    const db = getDb();
    const [accountRows, accountTotals, assignmentTotals] = await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          accountType: recipientProfiles.accountType,
          mustChangePassword: recipientProfiles.mustChangePassword,
          createdAt: recipientProfiles.createdAt,
        })
        .from(recipientProfiles)
        .innerJoin(user, eq(recipientProfiles.userId, user.id))
        .where(and(...conditions))
        .orderBy(direction(sortColumn), direction(user.id))
        .limit(pageQuery.pageSize)
        .offset(pageQuery.offset),
      db
        .select({ total: count() })
        .from(recipientProfiles)
        .innerJoin(user, eq(recipientProfiles.userId, user.id))
        .where(and(...conditions)),
      db
        .select({ total: count() })
        .from(formAssignments)
        .innerJoin(templates, eq(formAssignments.templateId, templates.id))
        .where(eq(templates.ownerEmail, ownerEmail)),
    ]);
    const accountIds = accountRows.map((account) => account.id);
    const linkedCandidates = accountIds.length > 0
      ? await db.select({
        id: candidates.id,
        userId: candidates.userId,
        name: candidates.fullName,
      }).from(candidates).where(and(
        eq(candidates.ownerEmail, ownerEmail),
        inArray(candidates.userId, accountIds),
      ))
      : [];
    const linkedByUser = new Map(linkedCandidates.map((candidate) => [
      candidate.userId,
      { id: candidate.id, name: candidate.name },
    ]));
    const assignmentRows = accountIds.length > 0
      ? await db
        .select({
          id: formAssignments.id,
          userId: formAssignments.userId,
          templateId: formAssignments.templateId,
          templateName: templates.name,
          versionNumber: templateVersions.versionNumber,
          roleId: formAssignments.roleId,
          roleName: formAssignments.roleName,
          roleColor: formAssignments.roleColor,
          status: formAssignments.status,
          linkStatus: recipientLinks.status,
          assignedAt: formAssignments.assignedAt,
          completedAt: formAssignments.completedAt,
          updatedAt: formAssignments.updatedAt,
          prefillMode: formAssignments.prefillMode,
          initialValuesJson: formAssignments.initialValuesJson,
          availableValuesJson: formAssignments.availableValuesJson,
          candidateProfileVersionId: formAssignments.candidateProfileVersionId,
          candidateProfileVersionNumber: candidateProfileVersions.versionNumber,
          candidateName: candidates.fullName,
          candidateFileName: resumes.fileName,
        })
        .from(formAssignments)
        .innerJoin(templates, eq(formAssignments.templateId, templates.id))
        .innerJoin(
          templateVersions,
          eq(formAssignments.templateVersionId, templateVersions.id),
        )
        .innerJoin(
          recipientLinks,
          eq(formAssignments.recipientLinkId, recipientLinks.id),
        )
        .leftJoin(
          candidateProfileVersions,
          eq(
            formAssignments.candidateProfileVersionId,
            candidateProfileVersions.id,
          ),
        )
        .leftJoin(
          candidates,
          eq(candidateProfileVersions.candidateId, candidates.id),
        )
        .leftJoin(
          resumes,
          eq(candidateProfileVersions.resumeId, resumes.id),
        )
        .where(and(
          eq(templates.ownerEmail, ownerEmail),
          inArray(formAssignments.userId, accountIds),
        ))
        .orderBy(desc(formAssignments.assignedAt), desc(formAssignments.id))
      : [];
    const assignmentsByUser = new Map<string, RecipientAssignmentSummary[]>();
    for (const assignment of assignmentRows) {
      const list = assignmentsByUser.get(assignment.userId) ?? [];
      list.push({
        id: assignment.id,
        templateId: assignment.templateId,
        templateName: assignment.templateName,
        versionNumber: assignment.versionNumber,
        roleId: assignment.roleId,
        roleName: assignment.roleName,
        roleColor: assignment.roleColor,
        status:
          assignment.status === "assigned"
            ? assignment.linkStatus
            : assignment.status,
        assignedAt:
          toUtcIsoString(assignment.assignedAt) ?? assignment.assignedAt,
        completedAt: assignment.completedAt
          ? toUtcIsoString(assignment.completedAt) ?? assignment.completedAt
          : null,
        updatedAt:
          toUtcIsoString(assignment.updatedAt) ?? assignment.updatedAt,
        prefillMode:
          assignment.prefillMode === "suggested"
          || assignment.prefillMode === "none"
            ? assignment.prefillMode
            : "automatic",
        approvedFieldCount: Object.keys({
          ...parseRecord(assignment.initialValuesJson),
          ...parseRecord(assignment.availableValuesJson),
        }).length,
        candidateProfileVersionId:
          assignment.candidateProfileVersionId ?? null,
        candidateProfileVersionNumber:
          assignment.candidateProfileVersionNumber ?? null,
        candidateName: assignment.candidateName ?? "",
        candidateFileName: assignment.candidateFileName ?? "",
      });
      assignmentsByUser.set(assignment.userId, list);
    }
    const accounts: RecipientAccountSummary[] = accountRows.flatMap((account) =>
      isRecipientAccountType(account.accountType)
        ? [{
            ...account,
            accountType: account.accountType,
            createdAt: toUtcIsoString(account.createdAt) ?? account.createdAt,
            linkedCandidate: linkedByUser.get(account.id) ?? null,
            assignments: assignmentsByUser.get(account.id) ?? [],
          }]
        : [],
    );
    return Response.json(
      {
        items: accounts,
        stats: {
          accounts: accountTotals[0]?.total ?? 0,
          assignments: assignmentTotals[0]?.total ?? 0,
        },
        ...createPageMeta(accountTotals[0]?.total ?? 0, pageQuery),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list recipient accounts", error);
    return jsonError("Accounts could not be loaded.", 500);
  }
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function POST(request: Request) {
  let createdUserId: string | null = null;
  try {
    const ownerEmail = await requireRequestOwner(request);
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const accountType = body.accountType;
    if (!name || name.length > 120) {
      return jsonError("Name must be between 1 and 120 characters.", 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) {
      return jsonError("Enter a valid email address.", 400);
    }
    if (!isStrongAccountPassword(password)) {
      return jsonError(
        "Temporary password needs 12–128 characters with uppercase, lowercase, number, and symbol.",
        400,
      );
    }
    if (!isRecipientAccountType(accountType)) {
      return jsonError("Choose candidate or employee.", 400);
    }

    const created = await getAuth().api.createUser({
      body: { name, email, password, role: "user" },
    });
    createdUserId = created.user.id;
    const now = new Date().toISOString();
    const db = getDb();
    const [candidate] = accountType === "candidate"
      ? await db.select({ id: candidates.id, fullName: candidates.fullName }).from(candidates).where(and(
          eq(candidates.ownerEmail, ownerEmail),
          eq(candidates.normalizedEmail, normalizeEmail(email)),
          isNull(candidates.userId),
        )).orderBy(desc(candidates.updatedAt)).limit(1)
      : [];
    const createProfile = db.insert(recipientProfiles).values({
        userId: created.user.id,
        accountType,
        mustChangePassword: true,
        createdByEmail: ownerEmail,
        createdAt: now,
        updatedAt: now,
      });
    const recordCreation = db.insert(auditEvents).values(
      createAuditEvent({
        request,
        ownerEmail,
        actorType: "owner",
        actorId: ownerEmail,
        action: "account.created",
        targetType: "account",
        targetId: created.user.id,
        metadata: { accountType },
        createdAt: now,
      }),
    );
    if (candidate) {
      await db.batch([
        createProfile,
        db.update(candidates).set({ userId: created.user.id, updatedAt: now }).where(and(eq(candidates.id, candidate.id), eq(candidates.ownerEmail, ownerEmail))),
        recordCreation,
      ]);
    } else {
      await db.batch([createProfile, recordCreation]);
    }

    return Response.json(
      {
        account: {
          id: created.user.id,
          name,
          email,
          accountType,
          temporaryPassword: password,
          mustChangePassword: true,
          createdAt: now,
          assignments: [],
          linkedCandidate: candidate
            ? { id: candidate.id, name: candidate.fullName }
            : null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (createdUserId) {
      await getDb().delete(user).where(eq(user.id, createdUserId)).catch(() => undefined);
    }
    if (isResponse(error)) return error;
    console.error("Failed to create recipient account", error);
    const message = error instanceof Error && /already|exists/iu.test(error.message)
      ? "An account with this email already exists."
      : "The account could not be created.";
    return jsonError(message, /already|exists/iu.test(message) ? 409 : 500);
  }
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && !Array.isArray(parsed) && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
