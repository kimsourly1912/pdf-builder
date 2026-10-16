import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { LegacyWorkspace } from "@/features/hiring/legacy-workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/hiring/legacy");
  return <LegacyWorkspace displayName={owner.displayName} />;
}
