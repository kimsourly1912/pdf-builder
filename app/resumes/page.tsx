import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ResumeLibrary } from "@/features/resumes/resume-library";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const user = await requireChatGPTUser("/resumes");
  return <ResumeLibrary displayName={user.displayName} />;
}

