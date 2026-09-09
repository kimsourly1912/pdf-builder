import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getRecipientAccount } from "@/features/accounts/account.server";

export async function requireRecipientUser(returnTo: string) {
  const account = await getRecipientAccount(await headers());
  if (!account) {
    redirect(`/sign-in?return_to=${encodeURIComponent(returnTo)}`);
  }
  if (account.profile.mustChangePassword && returnTo !== "/change-password") {
    redirect("/change-password");
  }
  return {
    id: account.session.user.id,
    name: account.session.user.name,
    email: account.session.user.email,
    accountType: account.profile.accountType,
    mustChangePassword: account.profile.mustChangePassword,
  };
}
