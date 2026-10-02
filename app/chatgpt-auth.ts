import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOwnerSession } from "@/lib/auth";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const SIGN_IN_PATH = "/sign-in";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const session = await getOwnerSession(requestHeaders);
  if (!session) return null;

  return {
    displayName: session.user.name || session.user.email,
    email: session.user.email,
    fullName: session.user.name || null,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(signInPath(returnTo));
}

export function signInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (url.pathname === SIGN_IN_PATH) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}
