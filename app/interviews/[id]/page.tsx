import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { InterviewDetail } from "@/features/interviews/interview-detail";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    owner = await requireChatGPTUser(`/interviews/${id}`);
  return <InterviewDetail displayName={owner.displayName} processId={id} />;
}
