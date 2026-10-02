import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramConnections } from "@/features/telegram/schema";
import { botConfiguration } from "@/features/telegram/bot.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
export async function GET(request: Request) {
  return workflowResponse(async () => ({
    bot: botConfiguration(),
    items: await getDb()
      .select({
        id: telegramConnections.id,
        fullName: telegramConnections.fullName,
        email: telegramConnections.email,
        username: telegramConnections.username,
      })
      .from(telegramConnections)
      .where(
        eq(telegramConnections.ownerEmail, await requireRequestOwner(request)),
      )
      .limit(200),
  }));
}
