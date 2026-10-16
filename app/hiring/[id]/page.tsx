import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ApplicationDetail } from "@/features/hiring/application-detail";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params,
    owner = await requireChatGPTUser(`/hiring/${id}`);
  return <ApplicationDetail displayName={owner.displayName} id={id} />;
}
