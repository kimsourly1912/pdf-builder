import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, templates } from "@/db/schema";
import {
  getFilesBucket,
  hashRecipientToken,
  jsonError,
} from "@/features/templates/template.server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{40,60}$/u.test(token)) {
      return jsonError("Fill link not found.", 404);
    }
    const db = getDb();
    const [row] = await db
      .select({ link: recipientLinks, template: templates })
      .from(recipientLinks)
      .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
      .where(
        and(
          eq(recipientLinks.tokenHash, await hashRecipientToken(token)),
          eq(recipientLinks.status, "active"),
        ),
      )
      .limit(1);
    if (!row) return jsonError("Fill link not found.", 404);
    if (row.link.expiresAt && new Date(row.link.expiresAt) <= new Date()) {
      return jsonError("This fill link has expired.", 410);
    }
    const object = await getFilesBucket().get(row.template.fileKey);
    if (!object) return jsonError("PDF not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    console.error("Failed to load recipient PDF", error);
    return jsonError("The PDF could not be loaded.", 500);
  }
}
