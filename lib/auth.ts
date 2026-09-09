import "server-only";

import { env } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins";

import { getDb } from "@/db";
import * as schema from "@/db/schema";

type AuthEnvironment = {
  AUTH_BOOTSTRAP_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  ENVIRONMENT?: string;
  MANAGEMENT_EMAIL?: string;
};

const runtime = env as unknown as AuthEnvironment;
const production = runtime.ENVIRONMENT === "production";
const managementEmail = (
  runtime.MANAGEMENT_EMAIL ?? (production ? "" : "owner@localhost")
)
  .trim()
  .toLowerCase();

if (!managementEmail) {
  throw new Error("MANAGEMENT_EMAIL is required in production.");
}
if (production && !runtime.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required in production.");
}

const baseURL =
  runtime.BETTER_AUTH_URL ??
  (production
    ? "https://pdf-builder.kimsur61.workers.dev"
    : "http://localhost:5173");

function createAuth() {
  return betterAuth({
  appName: "PDF Builder",
  baseURL,
  secret:
    runtime.BETTER_AUTH_SECRET ??
    "pdf-builder-local-development-secret-change-before-production",
  database: drizzleAdapter(getDb(), {
    provider: "sqlite",
    schema,
  }),
  plugins: [admin()],
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: production,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  trustedOrigins: [baseURL],
  advanced: {
    cookiePrefix: "pdf_builder",
    useSecureCookies: production,
    database: { generateId: "uuid" },
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    trustedProxyHeaders: true,
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path !== "/sign-up/email") return;

      const suppliedToken = context.request?.headers.get(
        "x-pdf-builder-bootstrap",
      );
      const bootstrapToken = runtime.AUTH_BOOTSTRAP_TOKEN;
      const requestedEmail = String(context.body?.email ?? "")
        .trim()
        .toLowerCase();

      if (
        !bootstrapToken ||
        !suppliedToken ||
        suppliedToken !== bootstrapToken ||
        requestedEmail !== managementEmail
      ) {
        throw new APIError("FORBIDDEN", {
          message: "Account registration is disabled.",
        });
      }
    }),
  },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  authInstance ??= createAuth();
  return authInstance;
}

export type OwnerSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>
>;

export type AuthSession = OwnerSession;

export async function getAuthSession(
  requestHeaders: Headers,
): Promise<AuthSession | null> {
  const cookie = requestHeaders.get("cookie") ?? "";
  if (!cookie.includes("pdf_builder.session_token=")) return null;
  return getAuth().api.getSession({ headers: requestHeaders });
}

export async function getOwnerSession(
  requestHeaders: Headers,
): Promise<OwnerSession | null> {
  const session = await getAuthSession(requestHeaders);
  if (!session) return null;
  if (session.user.email.trim().toLowerCase() !== managementEmail) return null;
  return session;
}
