import { telegramRuntime } from "@/features/telegram/bot.server";
import { receiveTelegramUpdate } from "@/features/telegram/intake.server";
import { parseTelegramUpdate } from "@/features/telegram/telegram";
export async function POST(request: Request) {
  const secret = telegramRuntime().TELEGRAM_WEBHOOK_SECRET;
  if (!secret)
    return Response.json(
      { error: "Telegram is not configured." },
      { status: 503 },
    );
  const supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  // Compare fixed-size digests so secret comparisons do not short circuit.
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied ?? "")),
  ]);
  let difference = 0;
  for (let i = 0; i < 32; i++)
    difference |= new Uint8Array(a)[i] ^ new Uint8Array(b)[i];
  if (!supplied || difference)
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.text();
  if (body.length > 64000) return new Response(null, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const update = parseTelegramUpdate(parsed);
  if (!update) return Response.json({ ok: true });
  try {
    await receiveTelegramUpdate(update);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Try again." }, { status: 503 });
  }
}
