import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AnalysisHistory } from "@/features/archive/analysis-history";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/analyses");
  return <AnalysisHistory displayName={owner.displayName} />;
}
