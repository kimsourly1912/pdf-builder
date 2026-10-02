import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
import { intakeList } from "@/features/telegram/intake.server";
import { botConfiguration } from "@/features/telegram/bot.server";
export async function GET(request: Request) {
  return workflowResponse(async () => ({
    items: await intakeList(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
    bot: botConfiguration(),
  }));
}
