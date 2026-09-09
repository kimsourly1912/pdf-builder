import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => vite.close());

const accountShare = await vite.ssrLoadModule(
  "/features/accounts/account-share.ts",
);

test("generates a strong temporary password", () => {
  const password = accountShare.generateTemporaryPassword();
  assert.equal(password.length, 16);
  assert.match(password, /[A-Z]/u);
  assert.match(password, /[a-z]/u);
  assert.match(password, /[0-9]/u);
  assert.match(password, /[!@#$%*_+-]/u);
  assert.equal(accountShare.isStrongAccountPassword(password), true);
});

test("rejects weak account passwords", () => {
  assert.equal(accountShare.isStrongAccountPassword("alllowercase12!"), false);
  assert.equal(accountShare.isStrongAccountPassword("NOLOWERCASE12!"), false);
  assert.equal(accountShare.isStrongAccountPassword("NoNumbersHere!"), false);
  assert.equal(accountShare.isStrongAccountPassword("NoSymbolsHere12"), false);
});

test("builds complete recipient credentials", () => {
  const message = accountShare.buildAccountCredentialMessage({
    name: "Sokha",
    email: "sokha@example.com",
    temporaryPassword: "Temp-password-42",
    accountType: "candidate",
    loginUrl: "https://example.com/sign-in?return_to=%2Fportal",
  });
  assert.match(message, /candidate account/u);
  assert.match(message, /sokha@example\.com/u);
  assert.match(message, /Temp-password-42/u);
  assert.match(message, /create a new password/u);
});

test("encodes the login and message for Telegram sharing", () => {
  const shareUrl = new URL(
    accountShare.buildTelegramShareUrl({
      loginUrl: "https://example.com/sign-in?return_to=%2Fportal",
      message: "Hello & welcome",
    }),
  );
  assert.equal(shareUrl.origin, "https://t.me");
  assert.equal(shareUrl.pathname, "/share/url");
  assert.equal(
    shareUrl.searchParams.get("url"),
    "https://example.com/sign-in?return_to=%2Fportal",
  );
  assert.equal(shareUrl.searchParams.get("text"), "Hello & welcome");
});
