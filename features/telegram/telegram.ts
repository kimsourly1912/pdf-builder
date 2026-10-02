export type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from: { id: number; is_bot?: boolean; username?: string };
  text?: string;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
};
export type TelegramUpdate = { update_id: number; message: TelegramMessage };
export function parseTelegramUpdate(value: unknown): TelegramUpdate | null {
  if (!value || typeof value !== "object") return null;
  const u = value as TelegramUpdate;
  const m = u.message;
  if (
    !Number.isSafeInteger(u.update_id) ||
    u.update_id < 0 ||
    !m ||
    !Number.isSafeInteger(m.message_id) ||
    m.chat?.type !== "private" ||
    !Number.isSafeInteger(m.chat.id) ||
    m.chat.id <= 0 ||
    m.from?.id !== m.chat.id ||
    m.from.is_bot
  )
    return null;
  if (
    m.text !== undefined &&
    (typeof m.text !== "string" || m.text.length > 4096)
  )
    return null;
  if (
    m.document &&
    (typeof m.document.file_id !== "string" ||
      m.document.file_id.length > 512 ||
      !m.document.file_id)
  )
    return null;
  return u;
}
export function validIntakeName(value: string) {
  return (
    value.trim().length >= 2 &&
    value.trim().length <= 120 &&
    !/[\u0000-\u001f]/u.test(value)
  );
}
export function validIntakeEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}
export function validTelegramFilePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_/.-]+$/u.test(value) &&
    !value.includes("..") &&
    !value.startsWith("/")
  );
}
export function invitationText(
  template: string,
  name: string,
  email: string,
  formCount: number,
) {
  return template
    .replaceAll("{name}", name)
    .replaceAll("{email}", email)
    .replaceAll("{formCount}", String(formCount));
}
export const DEFAULT_TELEGRAM_MESSAGE =
  "Hello {name}, your PDF Studio account is ready.\nEmail: {email}\nYou have {formCount} assigned forms. Open the link below to continue.";
