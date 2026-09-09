import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientProfiles } from "@/db/schema";
import { requireRecipientAccount } from "@/features/accounts/account.server";
import { isStrongAccountPassword } from "@/features/accounts/account-share";
import {
  isResponse,
  jsonError,
} from "@/features/templates/template.server";
import { getAuth } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const account = await requireRecipientAccount(request.headers);
    const body = (await request.json()) as Record<string, unknown>;
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!isStrongAccountPassword(newPassword)) {
      return jsonError(
        "New password needs 12–128 characters with uppercase, lowercase, number, and symbol.",
        400,
      );
    }
    if (newPassword === currentPassword) {
      return jsonError("Choose a new password that is different from the temporary password.", 400);
    }
    await getAuth().api.changePassword({
      headers: request.headers,
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    });
    await getDb()
      .update(recipientProfiles)
      .set({ mustChangePassword: false, updatedAt: new Date().toISOString() })
      .where(eq(recipientProfiles.userId, account.session.user.id));
    return Response.json({ changed: true });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to change temporary password", error);
    return jsonError("The current password is incorrect or the password could not be changed.", 400);
  }
}
