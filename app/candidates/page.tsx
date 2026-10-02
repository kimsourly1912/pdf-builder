import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProgressDashboard } from "@/features/candidate-progress/progress-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/candidates");
  return (
    <ProgressDashboard
      displayName={owner.displayName}
      preferenceKey={`candidate-progress-view:${owner.email}`}
    />
  );
}
