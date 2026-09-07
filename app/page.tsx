import { PdfEditor } from "@/app/pdf-editor";
import { requireChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  return <PdfEditor />;
}
