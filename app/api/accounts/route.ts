import { desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  formAssignments,
  recipientLinks,
  recipientProfiles,
  templates,
  templateVersions,
  user,
} from "@/db/schema";
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
    const db = getDb();
    const [accountRows, assignmentRows] = await Promise.all([
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
        .where(eq(recipientProfiles.createdByEmail, ownerEmail))
        .orderBy(desc(recipientProfiles.createdAt)),
      db
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
        .where(eq(templates.ownerEmail, ownerEmail))
        .orderBy(desc(formAssignments.assignedAt)),
    ]);
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
      });
      assignmentsByUser.set(assignment.userId, list);
    }
    const accounts: RecipientAccountSummary[] = accountRows.flatMap((account) =>
      isRecipientAccountType(account.accountType)
        ? [{
            ...account,
            accountType: account.accountType,
            createdAt: toUtcIsoString(account.createdAt) ?? account.createdAt,
            assignments: assignmentsByUser.get(account.id) ?? [],
          }]
        : [],
    );
    return Response.json({ accounts });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list recipient accounts", error);
    return jsonError("Accounts could not be loaded.", 500);
  }
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
    await getDb().insert(recipientProfiles).values({
      userId: created.user.id,
      accountType,
      mustChangePassword: true,
      createdByEmail: ownerEmail,
      createdAt: now,
      updatedAt: now,
    });

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
