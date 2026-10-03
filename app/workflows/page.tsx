import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { WorkflowList } from "@/features/workflows/workflow-list";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireChatGPTUser("/workflows");
  return (
    <WorkflowList
      displayName={user.displayName}
      preferenceKey={`workflow-filters:${user.email}`}
    />
  );
}
