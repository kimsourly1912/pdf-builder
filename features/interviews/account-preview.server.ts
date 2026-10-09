import "server-only";
import { getDatabaseBinding } from "@/db";
import { jsonError } from "@/features/templates/template.server";
import { detailInterview } from "./interviews.server";

/** Only the account pinned to this owned interview; never return credentials or sessions. */
export async function interviewAccountPreview(
  owner: string,
  processId: string,
) {
  const process = await detailInterview(owner, processId);
  if (!process.snapshot.accountId)
    throw jsonError("This interview has no linked account.", 404);
  const account = await getDatabaseBinding()
    .prepare(
      `SELECT u.name,u.email,p.account_type accountType,
    p.must_change_password mustChangePassword,COALESCE(u.banned,0) banned
    FROM user u JOIN recipient_profiles p ON p.user_id=u.id
    WHERE u.id=? AND p.created_by_email=?`,
    )
    .bind(process.snapshot.accountId, owner)
    .first<{
      name: string;
      email: string;
      accountType: string;
      mustChangePassword: number;
      banned: number;
    }>();
  if (!account)
    throw jsonError(
      "The linked account is unavailable in this workspace.",
      404,
    );
  return {
    name: account.name,
    email: account.email,
    accountType: account.accountType,
    mustChangePassword: !!account.mustChangePassword,
    blocked: !!account.banned,
  };
}
