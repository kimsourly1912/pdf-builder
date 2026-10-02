import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb } from "@/db";
import { account, recipientProfiles, session, user } from "@/db/schema";
import { isStrongAccountPassword } from "@/features/accounts/account-share";
import {
  accountActivations,
  activationRedemptions,
  telegramDeliveries,
} from "@/features/telegram/schema";
import { tokenHash } from "@/features/telegram/activation";
import { telegramRuntime } from "@/features/telegram/bot.server";
export async function POST(request: Request) {
  const origin = telegramRuntime().BETTER_AUTH_URL ?? "http://localhost:5173";
  if (request.headers.get("origin") !== new URL(origin).origin)
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 4096) return new Response(null, { status: 413 });
    const body = JSON.parse(text) as { token?: unknown; password?: unknown };
    if (
      typeof body.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(body.token) ||
      typeof body.password !== "string" ||
      !isStrongAccountPassword(body.password)
    )
      return Response.json(
        {
          error:
            "Enter a strong password of 12–128 characters with uppercase, lowercase, number, and symbol.",
        },
        { status: 422 },
      );
    const hash = await tokenHash(body.token),
      db = getDb(),
      now = new Date().toISOString();
    const [activation] = await db
      .select()
      .from(accountActivations)
      .where(
        and(
          eq(accountActivations.tokenHash, hash),
          sql`${accountActivations.usedAt} IS NULL`,
          sql`${accountActivations.expiresAt}>${now}`,
        ),
      )
      .limit(1);
    if (!activation)
      return Response.json(
        {
          error:
            "This invitation is invalid, expired, or already used. Ask HR for a new invitation.",
        },
        { status: 410 },
      );
    const password = await hashPassword(body.password);
    const [candidateUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, activation.userId))
      .limit(1);
    await db.batch([
      db
        .insert(activationRedemptions)
        .values({ tokenHash: hash, checkedAt: new Date().toISOString() }),
      db
        .update(account)
        .set({ password, updatedAt: new Date() })
        .where(
          and(
            eq(account.userId, activation.userId),
            eq(account.providerId, "credential"),
          ),
        ),
      db
        .update(recipientProfiles)
        .set({ mustChangePassword: false, updatedAt: now })
        .where(eq(recipientProfiles.userId, activation.userId)),
      db
        .update(accountActivations)
        .set({ usedAt: now })
        .where(eq(accountActivations.id, activation.id)),
      db.delete(session).where(eq(session.userId, activation.userId)),
      db
        .update(telegramDeliveries)
        .set({ tokenCipher: null })
        .where(eq(telegramDeliveries.runId, activation.id)),
    ]);
    return Response.json(
      { email: candidateUser.email },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "This invitation could not be activated. It may have expired or already been used.",
      },
      { status: 409 },
    );
  }
}
