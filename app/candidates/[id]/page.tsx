import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProgressDetail } from "@/features/candidate-progress/progress-detail";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    owner = await requireChatGPTUser(`/candidates/${id}`);
  return <ProgressDetail displayName={owner.displayName} candidateId={id} />;
}
