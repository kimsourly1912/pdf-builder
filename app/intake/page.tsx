import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { IntakeDashboard } from "@/features/telegram/intake-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/intake");
  return <IntakeDashboard displayName={user.displayName} />;
}
