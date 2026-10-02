import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ResumeDetailView } from "@/features/resumes/resume-detail";

export const dynamic = "force-dynamic";

export default async function ResumeDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await requireChatGPTUser(`/resumes/${id}`);
  return <ResumeDetailView resumeId={id} />;
}

