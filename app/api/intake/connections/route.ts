import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { telegramConnections } from "@/features/telegram/schema";
import { botConfiguration } from "@/features/telegram/bot.server";
import { requireRequestOwner } from "@/features/templates/template.server";
import { workflowResponse } from "@/features/workflows/api.server";
export async function GET(request: Request) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    const rows = await getDb().select({id:telegramConnections.id,fullName:telegramConnections.fullName,email:telegramConnections.email,username:telegramConnections.username,confirmedCandidateId:telegramConnections.confirmedCandidateId,confirmedBy:telegramConnections.confirmedBy,revision:telegramConnections.updatedAt}).from(telegramConnections).where(eq(telegramConnections.ownerEmail,owner)).limit(200);
    return {bot:botConfiguration(),items:rows.map(row=>({...row,confirmedCandidateId:row.confirmedBy===owner ? row.confirmedCandidateId : null}))};
  });
}
