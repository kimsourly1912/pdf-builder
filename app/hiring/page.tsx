import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { HiringBoard } from "@/features/hiring/hiring-board";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/hiring");
  return (
    <HiringBoard
      displayName={owner.displayName}
      preferenceKey={`hiring-board:${owner.email}`}
    />
  );
}
