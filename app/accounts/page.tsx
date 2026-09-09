import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AccountsDashboard } from "@/features/accounts/accounts-dashboard";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireChatGPTUser("/accounts");
  return <AccountsDashboard displayName={user.displayName} />;
}
