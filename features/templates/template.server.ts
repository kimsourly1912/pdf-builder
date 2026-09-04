import "server-only";

import { env } from "cloudflare:workers";

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const CLOUDFLARE_ACCESS_EMAIL_HEADER = "cf-access-authenticated-user-email";

type FilesBucket = {
  delete(key: string): Promise<void>;
  get(key: string): Promise<{
    body: ReadableStream;
    httpEtag: string;
    size: number;
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
};

export function requireRequestOwner(request: Request): string {
  const runtime = env as unknown as {
    DEV_OWNER_EMAIL?: string;
    ENVIRONMENT?: string;
  };
  const email = (
    request.headers.get(USER_EMAIL_HEADER) ??
    request.headers.get(CLOUDFLARE_ACCESS_EMAIL_HEADER) ??
    (runtime.ENVIRONMENT === "development" ? runtime.DEV_OWNER_EMAIL : null)
  )
    ?.trim()
    .toLowerCase();
  if (!email) throw new Response("Authentication required", { status: 401 });
  return email;
}

export function getFilesBucket(): FilesBucket {
  const runtime = env as unknown as { FILES?: FilesBucket };
  if (!runtime.FILES) {
    throw new Error("Cloudflare R2 binding `FILES` is unavailable.");
  }
  return runtime.FILES;
}

export function createRecipientToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function hashRecipientToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function isResponse(error: unknown): error is Response {
  return error instanceof Response;
}
