import { requireRecipientUser } from "@/app/account-auth";
import { ChangePasswordForm } from "@/features/accounts/change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await requireRecipientUser("/change-password");
  return <ChangePasswordForm name={user.name} />;
}
