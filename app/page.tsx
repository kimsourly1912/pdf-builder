import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { hrHome } from "@/features/hr/home.server";
import { HrHome } from "@/features/hr/hr-home";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const { templateId } = await searchParams;
  // Preserve existing bookmarked template-editor URLs.
  if (
    typeof templateId === "string" &&
    /^[A-Za-z0-9_-]{1,120}$/u.test(templateId)
  )
    redirect(`/studio?templateId=${encodeURIComponent(templateId)}`);
  const owner = await requireChatGPTUser("/");
  return (
    <HrHome displayName={owner.displayName} data={await hrHome(owner.email)} />
  );
}
