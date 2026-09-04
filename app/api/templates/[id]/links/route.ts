import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, templates } from "@/db/schema";
import {
  createRecipientToken,
  hashRecipientToken,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = requireRequestOwner(request);
    const { id } = await context.params;
    const payload = (await request.json()) as { roleId?: string };
    const roleId = payload.roleId?.trim();
    if (!roleId) return jsonError("Recipient role is required.", 400);

    const db = getDb();
    const [template] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, id), eq(templates.ownerEmail, ownerEmail)))
      .limit(1);
    if (!template) return jsonError("Template not found.", 404);

    const [link] = await db
      .select()
      .from(recipientLinks)
      .where(
        and(
          eq(recipientLinks.templateId, template.id),
          eq(recipientLinks.roleId, roleId),
        ),
      )
      .limit(1);
    if (!link) return jsonError("Recipient role not found.", 404);

    const token = createRecipientToken();
    await db
      .update(recipientLinks)
      .set({ tokenHash: await hashRecipientToken(token), status: "active" })
      .where(eq(recipientLinks.id, link.id));

    return Response.json({
      link: {
        roleId: link.roleId,
        roleName: link.roleName,
        url: `${new URL(request.url).origin}/fill/${token}`,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to rotate recipient link", error);
    return jsonError("A new recipient link could not be created.", 500);
  }
}
