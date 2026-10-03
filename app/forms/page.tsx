import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { FormsDashboard } from "@/features/forms/forms-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/forms");
  return <FormsDashboard displayName={user.displayName} />;
}
