import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { InterviewDetail } from "@/features/interviews/interview-detail";
import { detailInterview } from "@/features/interviews/interviews.server";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params,
    owner = await requireChatGPTUser(`/interviews/${id}`);
  const query = await searchParams;
  if (!query.legacy) {
    const process = await detailInterview(owner.email, id);
    if (process.applicationId)
      redirect(
        `/hiring/${process.applicationId}?tab=interviews${query.task === "next" ? "&task=next" : ""}`,
      );
  }
  return <InterviewDetail displayName={owner.displayName} processId={id} />;
}
