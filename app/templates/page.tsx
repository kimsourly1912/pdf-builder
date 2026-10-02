import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { TemplatesDashboard } from "@/features/templates/templates-dashboard";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireChatGPTUser("/templates");
  return <TemplatesDashboard displayName={user.displayName} />;
}
