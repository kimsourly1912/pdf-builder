import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { FormResponses } from "@/features/forms/form-responses";
export const dynamic = "force-dynamic";
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireChatGPTUser("/forms");
  return <FormResponses displayName={user.displayName} id={id} />;
}
