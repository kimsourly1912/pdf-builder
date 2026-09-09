import { getDb } from "@/db";
import { recipientProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isRecipientAccountType } from "@/features/accounts/account.types";
import { getAuthSession, getOwnerSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getAuthSession(request.headers);
  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  const owner = await getOwnerSession(request.headers);
  if (owner) {
    return Response.json({
      authenticated: true,
      accountType: "owner",
      homePath: "/",
    });
  }
  const [profile] = await getDb()
    .select()
    .from(recipientProfiles)
    .where(eq(recipientProfiles.userId, session.user.id))
    .limit(1);
  if (!profile || !isRecipientAccountType(profile.accountType)) {
    return Response.json({ authenticated: false }, { status: 403 });
  }
  return Response.json({
    authenticated: true,
    accountType: profile.accountType,
    homePath: profile.mustChangePassword ? "/change-password" : "/portal",
  });
}
