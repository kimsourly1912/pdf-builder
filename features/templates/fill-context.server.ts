import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  formAssignments,
  recipientLinks,
  templates,
  templateVersions,
} from "@/db/schema";
import { parseAssignedFillIdentifier } from "./submission-artifact";
import { hashRecipientToken } from "./template.server";
export async function findFillContext(identifier: string) {
  const assignmentId = parseAssignedFillIdentifier(identifier),
    db = getDb();
  const query = db
    .select({
      link: recipientLinks,
      template: templates,
      version: templateVersions,
      assignment: formAssignments,
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
export type FillContext = NonNullable<
  Awaited<ReturnType<typeof findFillContext>>
>;
