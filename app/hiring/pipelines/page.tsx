import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { PipelineSettings } from "@/features/hiring/pipeline-settings";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/hiring/pipelines");
  return <PipelineSettings displayName={owner.displayName} />;
}
