import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ResumeLibrary } from "@/features/resumes/resume-library";

export const dynamic = "force-dynamic";

export default async function ResumesPage({ searchParams }: { searchParams: Promise<{ upload?: string }> }) {
  const user = await requireChatGPTUser("/resumes");
  const query = await searchParams;
  return <ResumeLibrary displayName={user.displayName} initialUpload={query.upload === "true"} />;
}

