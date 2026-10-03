import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

if (process.env.RESET_CONFIRMATION !== "RESET pdf-builder PRODUCTION") {
  throw new Error("Explicit production reset confirmation is required.");
}
if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("Production reset must run in the serialized production Actions job.");
}
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}; no data has been reset.`);
  return value;
};
const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const apiToken = required("CLOUDFLARE_API_TOKEN");
const password = required("OWNER_PASSWORD");
required("OPENAI_API_KEY");
const botToken = required("TELEGRAM_BOT_TOKEN");
required("TELEGRAM_WEBHOOK_SECRET");
if (password.length < 8 || password.length > 128) {
  throw new Error("Set an owner password of 8–128 characters before resetting.");
}
if (required("MANAGEMENT_EMAIL") !== "admin@gmail.com") {
  throw new Error("The requested reset owner must be admin@gmail.com.");
}
const origin = "https://pdf-builder.kimsur61.workers.dev";
const temporary = mkdtempSync(join(tmpdir(), "pdf-builder-reset-"));
const token = randomBytes(48).toString("hex");
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
let maintenanceDeployed = false;
let secretInstalled = false;

function run(args, input) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    env: process.env, input, stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
  });
  if (result.status !== 0) throw new Error("A reset infrastructure command failed; inspect the preceding log.");
}
async function cloudflare(path, options = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...options, headers: { Authorization: `Bearer ${apiToken}` }, signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(`Reset preflight failed (HTTP ${response.status}).`);
  return payload.result;
}
async function telegram(method, payload) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
    });
  } catch { throw new Error("Telegram reset preflight/operation is unavailable."); }
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`Telegram ${method} failed; no token details are logged.`);
  return body.result;
}
async function reset(path) {
  const response = await fetch(`${origin}/__reset/${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Maintenance ${path} operation failed (HTTP ${response.status}).`);
  return response.json();
}
try {
  const databases = await cloudflare("/d1/database?name=pdf-builder-db&per_page=100");
  const database = databases.find((item) => item.name === "pdf-builder-db");
  if (!database) throw new Error("The existing production database was not found.");
  const buckets = await cloudflare("/r2/buckets");
  if (!buckets.buckets?.some((bucket) => bucket.name === "pdf-builder-files")) {
    throw new Error("The existing production file bucket was not found.");
  }
  const bot = await telegram("getMe", {});
  if (bot.username?.toLowerCase() !== "anghr_bot") throw new Error("Unexpected Telegram bot.");
  const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
  if (config.name !== "pdf-builder" || config.vars.ENVIRONMENT !== "production") {
    throw new Error("Unexpected Worker configuration.");
  }
  config.d1_databases[0].database_id = database.uuid;
  config.main = join(temporary, "reset-maintenance-worker.mjs");
  delete config.assets;
  delete config.$schema;
  config.d1_databases[0].migrations_dir = resolve("drizzle");
  copyFileSync("scripts/reset-maintenance-worker.mjs", config.main);
  copyFileSync("scripts/reset-plan.mjs", join(temporary, "reset-plan.mjs"));
  const configPath = join(temporary, "wrangler.json");
  writeFileSync(configPath, JSON.stringify(config));
  // The random token goes through stdin as a Worker secret, never source or logs.
  run(["secret", "bulk", "--config", configPath], JSON.stringify({ PRODUCTION_RESET_TOKEN: token }));
  secretInstalled = true;
  run(["deploy", "--config", configPath]);
  maintenanceDeployed = true;
  const probe = await fetch(origin, { signal: AbortSignal.timeout(30000) });
  if (probe.status !== 503) throw new Error("Maintenance mode verification failed; reset refused.");
  await telegram("deleteWebhook", { drop_pending_updates: true });
  run(["queues", "purge", "pdf-builder-ai-field-detection", "--force", "--config", configPath]);
  console.log("Clearing production application records; schema and migrations are retained.");
  const databaseResult = await reset("database");
  console.log(`Verified ${databaseResult.clearedTables} empty tables and ${databaseResult.restoredTriggers} restored protection triggers.`);
  let deleted = 0;
  while (true) {
    const result = await reset("files");
    deleted += result.deleted;
    if (result.deleted === 0) break;
  }
  console.log(`Verified empty production file storage; removed ${deleted} objects.`);
  console.log("Reset complete. The next deployment step must recreate and verify the admin and Telegram webhook.");
} catch (error) {
  if (maintenanceDeployed) console.error("Production remains in maintenance mode. Fix the failed operation and rerun this reset job before testing.");
  throw error;
} finally {
  // Secret removal does not resume normal traffic; deployment does that next.
  try { if (secretInstalled) await cloudflare("/workers/scripts/pdf-builder/secrets/PRODUCTION_RESET_TOKEN", { method: "DELETE" }); }
  finally { rmSync(temporary, { recursive: true, force: true }); }
}
