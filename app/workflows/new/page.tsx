import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { WorkflowSetup } from "@/features/workflows/workflow-setup";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/workflows/new");
  return <WorkflowSetup displayName={user.displayName} />;
}
