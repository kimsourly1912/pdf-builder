import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { IntakeDetail } from "@/features/telegram/intake-detail";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/intake/${id}`);
  return <IntakeDetail displayName={user.displayName} intakeId={id} />;
}
