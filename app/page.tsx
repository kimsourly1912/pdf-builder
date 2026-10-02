import { PdfEditor } from "@/app/pdf-editor";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home(props: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  await requireChatGPTUser("/");
  const { templateId } = await props.searchParams;
  const initialTemplateId =
    typeof templateId === "string" && /^[A-Za-z0-9_-]{1,120}$/u.test(templateId)
      ? templateId
      : undefined;
  return <PdfEditor initialTemplateId={initialTemplateId} />;
}
