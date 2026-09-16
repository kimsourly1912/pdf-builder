import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AuditLog } from "@/features/audit/audit-log";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await requireChatGPTUser("/activity");
  return <AuditLog displayName={user.displayName} />;
}
