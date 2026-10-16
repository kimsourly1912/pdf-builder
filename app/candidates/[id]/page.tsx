import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ProgressDetail } from "@/features/candidate-progress/progress-detail";
import { redirect } from "next/navigation";
import {
  ApplicationChooser,
  candidateApplications,
} from "@/features/hiring/application-chooser";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params,
    owner = await requireChatGPTUser(`/candidates/${id}`);
  const query = await searchParams;
  if (!query.legacy && !query.tab) {
    const applications = await candidateApplications(owner.email, id);
    if (applications.length === 1) redirect(`/hiring/${applications[0].id}`);
    if (applications.length > 1)
      return (
        <ApplicationChooser
          items={applications}
          candidateId={id}
          displayName={owner.displayName}
        />
      );
  }
  return <ProgressDetail displayName={owner.displayName} candidateId={id} />;
}
