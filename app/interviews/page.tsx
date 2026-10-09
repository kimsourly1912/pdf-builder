import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { InterviewDashboard } from "@/features/interviews/interview-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/interviews");
  return (
    <InterviewDashboard
      displayName={owner.displayName}
      preferenceKey={`interview-progress:${owner.email}`}
    />
  );
}
