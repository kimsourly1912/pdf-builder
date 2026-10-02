import "server-only";
import { env } from "cloudflare:workers";
import { validTelegramFilePath } from "./telegram";
import { MAX_RESUME_BYTES } from "@/features/resumes/resume.types";

type TelegramRuntime = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  MANAGEMENT_EMAIL?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  ENVIRONMENT?: string;
};
export function telegramRuntime() {
  return env as unknown as TelegramRuntime;
}
export function botConfiguration() {
  const r = telegramRuntime();
  const username = r.TELEGRAM_BOT_USERNAME?.replace(/^@/u, "").trim();
  return {
    configured: !!(
      r.TELEGRAM_BOT_TOKEN &&
      r.TELEGRAM_WEBHOOK_SECRET &&
      username &&
      /^[A-Za-z0-9_]{5,32}$/u.test(username)
    ),
    username:
      username && /^[A-Za-z0-9_]{5,32}$/u.test(username) ? username : null,
  };
}
export class TelegramSendError extends Error {
  constructor(
    public readonly kind: "retryable" | "permanent" | "uncertain",
    public readonly retryAfter = 60,
  ) {
    super(
      kind === "permanent"
        ? "Telegram could not deliver this message. The candidate may have blocked the bot."
        : kind === "uncertain"
          ? "Delivery is uncertain. Confirm with the candidate before resending."
          : "Telegram is temporarily unavailable. Delivery will retry.",
    );
  }
}
export async function botRequest<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = telegramRuntime().TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramSendError("retryable", 300);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new TelegramSendError(
      method === "sendMessage" ? "uncertain" : "retryable",
    );
  }
  let data: { ok: boolean; result: T; parameters?: { retry_after?: number } };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new TelegramSendError(
      method === "sendMessage" ? "uncertain" : "retryable",
    );
  }
  if (!response.ok || !data.ok)
    throw new TelegramSendError(
      response.status === 429
        ? "retryable"
        : response.status >= 500
          ? method === "sendMessage"
            ? "uncertain"
            : "retryable"
          : "permanent",
      Math.max(1, Math.min(3600, data.parameters?.retry_after ?? 60)),
    );
  return data.result;
}
export function sendBotMessage(
  chatId: string,
  text: string,
  url?: string,
  button?: string,
  intakeMenu = false,
) {
  return botRequest<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
    ...(url
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: button ?? "Open your forms", url }]],
          },
        }
      : intakeMenu
        ? {
            reply_markup: {
              keyboard: [
                [{ text: "Add another CV" }, { text: "Replace unreviewed CV" }],
                [{ text: "Check application status" }],
              ],
              resize_keyboard: true,
              is_persistent: true,
            },
          }
        : {}),
  });
}
export async function downloadTelegramPdf(fileId: string) {
  const file = await botRequest<{ file_path?: string; file_size?: number }>(
    "getFile",
    { file_id: fileId },
  );
  if (
    !validTelegramFilePath(file.file_path) ||
    (file.file_size ?? 0) > MAX_RESUME_BYTES
  )
    throw new Error("Invalid Telegram PDF.");
  const response = await fetch(
    `https://api.telegram.org/file/bot${telegramRuntime().TELEGRAM_BOT_TOKEN}/${file.file_path}`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (
    !response.ok ||
    Number(response.headers.get("content-length") ?? 0) > MAX_RESUME_BYTES ||
    !response.body
  )
    throw new Error("PDF download unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.length;
    if (size > MAX_RESUME_BYTES) {
      await reader.cancel();
      throw new Error("PDF exceeds 15 MB.");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
