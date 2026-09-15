import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  formAssignments,
  recipientLinks,
  templates,
  templateVersions,
} from "@/db/schema";
import { authorizeAssignedRecipient } from "@/features/accounts/account.server";
import { recipientLinkAvailability } from "@/features/templates/recipient-link-lifecycle";
import { parseAssignedFillIdentifier } from "@/features/templates/submission-artifact";
import {
  getFilesBucket,
  hashRecipientToken,
  isResponse,
  jsonError,
} from "@/features/templates/template.server";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const row = await findRecipientPdfContext(token);
    if (!row) return jsonError("Fill link not found.", 404);
    await authorizeAssignedRecipient(request.headers, row.link.assignedUserId);

    const availability = recipientLinkAvailability(row.link);
    if (!availability.available) {
      return jsonError(availability.message, availability.httpStatus);
    }

    const object = await getFilesBucket().get(row.version.fileKey);
    if (!object) return jsonError("PDF not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to load recipient PDF", error);
    return jsonError("The PDF could not be loaded.", 500);
  }
}

async function findRecipientPdfContext(identifier: string) {
  const assignmentId = parseAssignedFillIdentifier(identifier);
  const db = getDb();
  const query = db
    .select({
      link: recipientLinks,
      template: templates,
      version: templateVersions,
    })
    .from(recipientLinks)
    .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
    .innerJoin(
      templateVersions,
      eq(recipientLinks.templateVersionId, templateVersions.id),
    )
    .leftJoin(
      formAssignments,
      eq(recipientLinks.id, formAssignments.recipientLinkId),
    );

  if (assignmentId) {
    const [row] = await query
      .where(eq(formAssignments.id, assignmentId))
      .limit(1);
    return row ?? null;
  }
  if (!/^[A-Za-z0-9_-]{40,60}$/u.test(identifier)) return null;
  const [row] = await query
    .where(eq(recipientLinks.tokenHash, await hashRecipientToken(identifier)))
    .limit(1);
  return row ?? null;
}
