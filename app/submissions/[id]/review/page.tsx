import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { SubmissionReview } from "@/features/hr/submission-review";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await requireChatGPTUser(`/submissions/${id}/review`);
  return <SubmissionReview id={id} displayName={owner.displayName} />;
}
