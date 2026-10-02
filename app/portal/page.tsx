import { requireRecipientUser } from "@/app/account-auth";
import { RecipientPortal } from "@/features/accounts/recipient-portal";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const user = await requireRecipientUser("/portal");
  return (
    <RecipientPortal
      displayName={user.name || user.email}
      email={user.email}
      accountType={user.accountType}
    />
  );
}
