import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AttentionDashboard } from "@/features/hr/attention-dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/needs-attention");
  return (
    <AttentionDashboard
      displayName={owner.displayName}
      preferenceKey={`needs-attention:${owner.email}`}
    />
  );
}
