import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { recipientLinks, templates } from "@/db/schema";
import {
  parseLinkExpiration,
  parseMaxSubmissions,
} from "@/features/templates/recipient-link-lifecycle";
import {
  createRecipientToken,
  hashRecipientToken,
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

type LinkPayload = {
  roleId?: string;
  expiresAt?: string | null;
  maxSubmissions?: number;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const payload = (await request.json()) as LinkPayload;
    const roleId = payload.roleId?.trim();
    if (!roleId) return jsonError("Recipient role is required.", 400);

    const now = new Date();
    const expiresAt = parseLinkExpiration(payload.expiresAt, now);
    const maxSubmissions = parseMaxSubmissions(payload.maxSubmissions);
    if (expiresAt === undefined) {
      return jsonError(
        "Expiration must be in the future and no more than one year away.",
        400,
      );
    }
    if (maxSubmissions === undefined) {
      return jsonError("Submission limit must be between 1 and 100.", 400);
    }

    const result = await findOwnedLink(id, roleId, ownerEmail);
    if (!result) return jsonError("Recipient role not found.", 404);

    const token = createRecipientToken();
    const updatedAt = now.toISOString();
    await getDb()
      .update(recipientLinks)
      .set({
        templateVersionId: result.template.currentVersionId,
        tokenHash: await hashRecipientToken(token),
        status: "active",
        expiresAt,
        maxSubmissions,
        submissionCount: 0,
        revokedAt: null,
        completedAt: null,
        updatedAt,
      })
      .where(eq(recipientLinks.id, result.link.id));

    return Response.json({
      link: {
        roleId: result.link.roleId,
        roleName: result.link.roleName,
        status: "active",
        expiresAt,
        maxSubmissions,
        submissionCount: 0,
        url: `${new URL(request.url).origin}/fill/${token}`,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to rotate recipient link", error);
    return jsonError("A new recipient link could not be created.", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    const payload = (await request.json()) as LinkPayload & { action?: string };
    const roleId = payload.roleId?.trim();
    if (!roleId) return jsonError("Recipient role is required.", 400);
    if (payload.action !== "revoke") {
      return jsonError("The requested link action is invalid.", 400);
    }

    const result = await findOwnedLink(id, roleId, ownerEmail);
    if (!result) return jsonError("Recipient role not found.", 404);

    const now = new Date().toISOString();
    await getDb()
      .update(recipientLinks)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(eq(recipientLinks.id, result.link.id));

    return Response.json({
      link: {
        roleId: result.link.roleId,
        roleName: result.link.roleName,
        status: "revoked",
        expiresAt: result.link.expiresAt,
        maxSubmissions: result.link.maxSubmissions,
        submissionCount: result.link.submissionCount,
      },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to revoke recipient link", error);
    return jsonError("The recipient link could not be revoked.", 500);
  }
}

async function findOwnedLink(
  templateId: string,
  roleId: string,
  ownerEmail: string,
) {
  const [row] = await getDb()
    .select({ link: recipientLinks, template: templates })
    .from(recipientLinks)
    .innerJoin(templates, eq(recipientLinks.templateId, templates.id))
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.ownerEmail, ownerEmail),
        eq(recipientLinks.roleId, roleId),
      ),
    )
    .limit(1);
  return row ?? null;
}

