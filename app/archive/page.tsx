import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ArchiveDashboard } from "@/features/archive/archive-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/archive");
  return <ArchiveDashboard displayName={owner.displayName} />;
}
