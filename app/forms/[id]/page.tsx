import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { FormBuilder } from "@/features/forms/form-builder";
export const dynamic = "force-dynamic";
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireChatGPTUser("/forms");
  return <FormBuilder displayName={user.displayName} id={id} />;
}
