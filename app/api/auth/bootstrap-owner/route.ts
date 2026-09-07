import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { account, session, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type AuthEnvironment = {
  AUTH_BOOTSTRAP_TOKEN?: string;
  MANAGEMENT_EMAIL?: string;
};

export async function POST(request: Request) {
  const runtime = env as unknown as AuthEnvironment;
  const expectedToken = runtime.AUTH_BOOTSTRAP_TOKEN;
  const suppliedToken = request.headers.get("x-pdf-builder-bootstrap");
  if (
    !expectedToken ||
    !suppliedToken ||
    !(await secretsMatch(suppliedToken, expectedToken))
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const ownerEmail = runtime.MANAGEMENT_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return Response.json(
      { error: "Management owner is not configured." },
      { status: 500 },
    );
  }

  const payload = (await request.json()) as { password?: unknown };
  const password = typeof payload.password === "string" ? payload.password : "";
  const authContext = await getAuth().$context;
  if (
    password.length < authContext.password.config.minPasswordLength ||
    password.length > authContext.password.config.maxPasswordLength
  ) {
    return Response.json(
      { error: "Password length is invalid." },
      { status: 400 },
    );
  }

  const db = getDb();
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ownerEmail))
    .limit(1);
  if (!owner) {
    return Response.json({ error: "Owner account not found." }, { status: 404 });
  }

  const [credential] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, owner.id),
        eq(account.providerId, "credential"),
      ),
    )
    .limit(1);
  if (!credential) {
    return Response.json(
      { error: "Owner credential account not found." },
      { status: 404 },
    );
  }

  const passwordHash = await authContext.password.hash(password);
  await db.batch([
    db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.id, credential.id)),
    db.delete(session).where(eq(session.userId, owner.id)),
  ]);

  return Response.json({ status: true });
}

async function secretsMatch(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

