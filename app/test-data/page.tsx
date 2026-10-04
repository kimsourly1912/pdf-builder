import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { TestDataDashboard } from "@/features/test-data/reset-dashboard";
import { testDataResetEnabled } from "@/features/test-data/reset.server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/test-data");
  return (
    <TestDataDashboard
      displayName={owner.displayName}
      enabled={testDataResetEnabled()}
    />
  );
}
