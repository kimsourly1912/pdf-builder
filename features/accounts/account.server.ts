import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientProfiles } from "@/db/schema";
import { isRecipientAccountType } from "@/features/accounts/account.types";
import type { RecipientAccountType } from "@/features/accounts/account.types";
import { getAuthSession } from "@/lib/auth";
import type { AuthSession } from "@/lib/auth";
import { jsonError } from "@/features/templates/template.server";

export type RecipientAccountContext = {
  session: AuthSession;
  profile: typeof recipientProfiles.$inferSelect & {
    accountType: RecipientAccountType;
  };
};

export async function getRecipientAccount(
  requestHeaders: Headers,
): Promise<RecipientAccountContext | null> {
  const session = await getAuthSession(requestHeaders);
  if (!session) return null;
  const [profile] = await getDb()
    .select()
    .from(recipientProfiles)
    .where(eq(recipientProfiles.userId, session.user.id))
    .limit(1);
  if (!profile || !isRecipientAccountType(profile.accountType)) return null;
  return { session, profile: { ...profile, accountType: profile.accountType } };
}

export async function requireRecipientAccount(
  requestHeaders: Headers,
): Promise<RecipientAccountContext> {
  const account = await getRecipientAccount(requestHeaders);
  if (!account) {
    throw jsonError("Sign in to open this assigned form.", 401);
  }
  return account;
}

export async function authorizeAssignedRecipient(
  requestHeaders: Headers,
  assignedUserId: string | null,
) {
  if (!assignedUserId) return null;
  const account = await requireRecipientAccount(requestHeaders);
  if (account.session.user.id !== assignedUserId) {
    throw jsonError("This form is assigned to another account.", 403);
  }
  if (account.profile.mustChangePassword) {
    throw jsonError(
      "Change your temporary password before opening forms.",
      428,
    );
  }
  return account;
}
