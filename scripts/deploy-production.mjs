import { managementPageReady } from "./deployment-pages.mjs";
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const ACCOUNT_ID = requiredEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
const API_TOKEN = requiredEnvironmentVariable("CLOUDFLARE_API_TOKEN");
const MANAGEMENT_EMAIL = requiredEnvironmentVariable("MANAGEMENT_EMAIL");
const OWNER_PASSWORD = requiredEnvironmentVariable("OWNER_PASSWORD");
const OPENAI_API_KEY = requiredEnvironmentVariable("OPENAI_API_KEY");

const WORKER_NAME = "pdf-builder";
const DATABASE_NAME = "pdf-builder-db";
const BUCKET_NAME = "pdf-builder-files";
const AI_FIELD_DETECTION_QUEUE_NAME = "pdf-builder-ai-field-detection";
const WRANGLER_CONFIG_PATH = "wrangler.jsonc";
const BUILT_WRANGLER_CONFIG_PATH = "dist/server/wrangler.json";
const ACCESS_APPLICATION_NAMES = [
  "PDF Builder production",
  "PDF Builder public fill pages",
  "PDF Builder public fill API",
  "PDF Builder public Gazetteer API",
  "PDF Builder public assets",
  "PDF Builder public authentication",
];

await main();

async function main() {
  console.log("Preparing the single production environment...");

  const [database, workersSubdomain] = await Promise.all([
    ensureD1Database(),
    getWorkersSubdomain(),
  ]);
  await ensureR2Bucket();
  ensureAiFieldDetectionQueue();

  const hostname = `${WORKER_NAME}.${workersSubdomain}.workers.dev`;
  await ensureAuthenticationBypass(hostname);
  writeProductionDatabaseId(database.uuid);
  // The Cloudflare Vite plugin snapshots bindings during the build. Rebuild
  // after injecting the real production D1 id, immediately before deployment.
  run("npm", ["run", "build"]);

  run("npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    WRANGLER_CONFIG_PATH,
  ]);

  await ensurePersistentAuthSecret();
  await putWorkerSecret("OPENAI_API_KEY", OPENAI_API_KEY);
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  let telegramSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (telegramToken && telegramSecret) {
    if (!/^[A-Za-z0-9_-]{16,256}$/u.test(telegramSecret)) {
      telegramSecret = randomSecret();
      console.log(
        "Generated a secure Telegram webhook secret to replace the invalid configured value.",
      );
    }
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${telegramToken}/getMe`,
        { signal: AbortSignal.timeout(25000) },
      );
      const result = await response.json();
      if (
        !response.ok ||
        !result.ok ||
        result.result.username?.toLowerCase() !== "anghr_bot"
      )
        throw new Error("Bot identity mismatch.");
    } catch {
      throw new Error(
        "Telegram bot verification failed. Supply the BotFather token for @anghr_bot.",
      );
    }
    await putWorkerSecret("TELEGRAM_BOT_TOKEN", telegramToken);
    await putWorkerSecret("TELEGRAM_WEBHOOK_SECRET", telegramSecret);
  } else
    console.log(
      "Telegram secrets were not supplied by Actions; existing Worker secrets are preserved.",
    );
  const bootstrapToken = randomSecret();
  await putWorkerSecret("AUTH_BOOTSTRAP_TOKEN", bootstrapToken);
  run("npx", ["wrangler", "deploy", "--config", BUILT_WRANGLER_CONFIG_PATH]);

  let authenticatedCookie;
  try {
    // A replaced maintenance Worker can still serve requests briefly after upload.
    // Wait for the real authentication API before attempting owner mutations.
    await waitForResponse(
      `https://${hostname}/api/auth/get-session`,
      { redirect: "manual" },
      (response) => response.status === 200,
    );
    authenticatedCookie = await bootstrapAndSignInOwner(
      hostname,
      bootstrapToken,
    );
  } finally {
    await deleteWorkerSecret("AUTH_BOOTSTRAP_TOKEN");
  }

  await removeLegacyAccessApplications();
  await verifyDeployment(hostname, authenticatedCookie);
  if (telegramToken && telegramSecret) {
    let response;
    try {
      response = await fetch(
        `https://api.telegram.org/bot${telegramToken}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://${hostname}/api/telegram/webhook`,
            secret_token: telegramSecret,
            allowed_updates: ["message"],
            drop_pending_updates: false,
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error("Webhook setup was rejected.");
    } catch {
      throw new Error(
        "Telegram webhook setup failed. Check the bot token and webhook secret in production secrets.",
      );
    }
    console.log("Telegram webhook configured successfully.");
  }
  const productionUrl = `https://${hostname}`;
  if (process.env.GITHUB_ENV) {
    appendFileSync(
      process.env.GITHUB_ENV,
      `PRODUCTION_URL=${productionUrl}\n`,
      "utf8",
    );
  }
  console.log(`Production deployment verified: ${productionUrl}`);
}

async function ensureD1Database() {
  const query = new URLSearchParams({ name: DATABASE_NAME, per_page: "100" });
  const databases = await cloudflareApi(`/d1/database?${query}`);
  const existing = databases.find(
    (database) => database.name === DATABASE_NAME,
  );
  if (existing) {
    console.log(`Using existing D1 database: ${DATABASE_NAME}`);
    return existing;
  }

  const database = await cloudflareApi("/d1/database", {
    method: "POST",
    body: JSON.stringify({
      name: DATABASE_NAME,
      primary_location_hint: "apac",
    }),
  });
  console.log(`Created D1 database: ${DATABASE_NAME}`);
  return database;
}

async function ensureR2Bucket() {
  const result = await cloudflareApi("/r2/buckets");
  const buckets = result.buckets ?? [];
  if (buckets.some((bucket) => bucket.name === BUCKET_NAME)) {
    console.log(`Using existing R2 bucket: ${BUCKET_NAME}`);
    return;
  }

  await cloudflareApi("/r2/buckets", {
    method: "POST",
    body: JSON.stringify({ name: BUCKET_NAME, locationHint: "apac" }),
  });
  console.log(`Created R2 bucket: ${BUCKET_NAME}`);
}

function ensureAiFieldDetectionQueue() {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "queues",
      "create",
      AI_FIELD_DETECTION_QUEUE_NAME,
      "--config",
      WRANGLER_CONFIG_PATH,
    ],
    {
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0) {
    console.log(`Created Cloudflare Queue: ${AI_FIELD_DETECTION_QUEUE_NAME}`);
    return;
  }
  if (/already exists|is already taken|has already been taken/iu.test(output)) {
    console.log(
      `Using existing Cloudflare Queue: ${AI_FIELD_DETECTION_QUEUE_NAME}`,
    );
    return;
  }
  process.stderr.write(output);
  throw new Error(
    `Could not create Cloudflare Queue ${AI_FIELD_DETECTION_QUEUE_NAME}.`,
  );
}

async function getWorkersSubdomain() {
  const result = await cloudflareApi("/workers/subdomain");
  if (!result.subdomain) {
    throw new Error(
      "Cloudflare Workers subdomain is not configured for this account.",
    );
  }
  return result.subdomain;
}

async function ensureAuthenticationBypass(hostname) {
  const applications = await cloudflareApi("/access/apps?per_page=100");
  const name = "PDF Builder public authentication";
  const domain = `${hostname}/api/auth*`;
  const existing = applications.find(
    (application) => application.name === name,
  );
  const body = {
    name,
    type: "self_hosted",
    domain,
    session_duration: "24h",
    app_launcher_visible: false,
    policies: [
      {
        name: `${name} policy`,
        decision: "bypass",
        precedence: 1,
        include: [{ everyone: {} }],
      },
    ],
  };

  if (existing) {
    await cloudflareApi(`/access/apps/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    console.log(`Updated temporary authentication bypass: ${domain}`);
  } else {
    await cloudflareApi("/access/apps", {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`Created temporary authentication bypass: ${domain}`);
  }
}

async function removeLegacyAccessApplications() {
  const applications = await cloudflareApi("/access/apps?per_page=100");
  const targets = applications.filter((application) =>
    ACCESS_APPLICATION_NAMES.includes(application.name),
  );
  for (const application of targets) {
    await cloudflareApi(`/access/apps/${application.id}`, { method: "DELETE" });
    console.log(
      `Removed legacy Cloudflare Access application: ${application.name}`,
    );
  }
}

async function ensurePersistentAuthSecret() {
  const secrets = await cloudflareApi(
    `/workers/scripts/${WORKER_NAME}/secrets`,
  );
  if (secrets.some((secret) => secret.name === "BETTER_AUTH_SECRET")) {
    console.log("Using existing Better Auth session secret.");
    return;
  }
  await putWorkerSecret("BETTER_AUTH_SECRET", randomSecret());
  console.log("Created the persistent Better Auth session secret.");
}

async function putWorkerSecret(name, value) {
  await cloudflareApi(`/workers/scripts/${WORKER_NAME}/secrets`, {
    method: "PUT",
    body: JSON.stringify({ name, text: value, type: "secret_text" }),
  });
}

async function deleteWorkerSecret(name) {
  await cloudflareApi(`/workers/scripts/${WORKER_NAME}/secrets/${name}`, {
    method: "DELETE",
  });
}

async function bootstrapAndSignInOwner(hostname, bootstrapToken) {
  const origin = `https://${hostname}`;
  let signInResponse = await signInOwner(origin);
  if (!signInResponse.ok) {
    const rotationResponse = await rotateOwnerPassword(origin, bootstrapToken);
    const rotationBody = await rotationResponse.text();
    if (rotationResponse.ok) {
      console.log(
        "Rotated the Better Auth owner password and revoked old sessions.",
      );
    } else if (
      rotationResponse.status === 404 &&
      rotationBody.includes("Owner account not found")
    ) {
      await createOwner(origin, bootstrapToken);
    } else {
      throw new Error(
        `Owner password rotation failed with HTTP ${rotationResponse.status}: ${rotationBody}`,
      );
    }
    signInResponse = await signInOwner(origin);
  } else {
    console.log(
      "The Better Auth owner account already exists and the configured password is valid.",
    );
  }
  if (!signInResponse.ok) {
    throw new Error(
      `Owner sign-in verification failed with HTTP ${signInResponse.status}.`,
    );
  }

  const cookie = responseCookieHeader(signInResponse);
  const sessionResponse = await fetch(`${origin}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  });
  const session = await sessionResponse.json();
  if (
    !sessionResponse.ok ||
    session?.user?.email?.trim().toLowerCase() !==
      MANAGEMENT_EMAIL.toLowerCase()
  ) {
    throw new Error("Better Auth did not return the expected owner session.");
  }
  console.log("Verified the Better Auth owner session.");
  return cookie;
}

async function createOwner(origin, bootstrapToken) {
  const response = await fetch(`${origin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "x-pdf-builder-bootstrap": bootstrapToken,
    },
    body: JSON.stringify({
      name: "PDF Builder Owner",
      email: MANAGEMENT_EMAIL,
      password: OWNER_PASSWORD,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Owner bootstrap failed with HTTP ${response.status}: ${await response.text()}`,
    );
  }
  console.log("Created the Better Auth owner account.");
}

function rotateOwnerPassword(origin, bootstrapToken) {
  return fetch(`${origin}/api/internal/bootstrap-owner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "x-pdf-builder-bootstrap": bootstrapToken,
    },
    body: JSON.stringify({ password: OWNER_PASSWORD }),
  });
}

function signInOwner(origin) {
  return fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: MANAGEMENT_EMAIL,
      password: OWNER_PASSWORD,
      rememberMe: true,
    }),
  });
}

function writeProductionDatabaseId(databaseId) {
  const config = readFileSync(WRANGLER_CONFIG_PATH, "utf8");
  const updated = config.replace(
    /("database_name"\s*:\s*"pdf-builder-db"[\s\S]*?"database_id"\s*:\s*)"[^"]+"/u,
    `$1"${databaseId}"`,
  );

  if (updated === config) {
    throw new Error(
      "Could not inject the production D1 database ID into wrangler.jsonc.",
    );
  }
  writeFileSync(WRANGLER_CONFIG_PATH, updated, "utf8");
}

async function verifyDeployment(hostname, authenticatedCookie) {
  await waitForResponse(
    `https://${hostname}/`,
    { redirect: "manual" },
    (response) =>
      [301, 302, 303, 307, 308].includes(response.status) &&
      (response.headers.get("location") ?? "").includes("/sign-in"),
  );

  const managementResponse = await fetch(`https://${hostname}/api/templates`, {
    redirect: "manual",
  });
  if (managementResponse.status !== 401) {
    throw new Error(
      `Expected unauthenticated management API HTTP 401, received ${managementResponse.status}.`,
    );
  }

  const authenticatedResponse = await fetch(
    `https://${hostname}/api/templates`,
    {
      headers: { Cookie: authenticatedCookie },
    },
  );
  if (!authenticatedResponse.ok) {
    throw new Error(
      `Authenticated management API failed with HTTP ${authenticatedResponse.status}.`,
    );
  }

  for (const path of [
    "/api/forms",
    "/api/workflows",
    "/api/workflow-runs",
    "/api/intake",
    "/api/archive",
    "/api/candidates",
    "/api/ai-field-detection/runs",
    "/",
    "/forms",
    "/submissions",
    "/administration",
    "/setup",
    "/setup/preview",
    "/advanced",
    "/studio",
    "/workflows",
    "/intake",
    "/archive",
    "/candidates",
    "/analyses",
  ]) {
    const response = await waitForResponse(
      `https://${hostname}${path}`,
      { headers: { Cookie: authenticatedCookie }, redirect: "manual" },
      async (result) =>
        result.status === 200 &&
        (path.startsWith("/api/") ||
          managementPageReady(path, await result.clone().text())),
    );
    if (response.status !== 200) {
      throw new Error(
        `Authenticated workflow smoke check ${path} failed with HTTP ${response.status}.`,
      );
    }
    if (path.startsWith("/api/")) {
      const body = await response.json();
      if (
        !Array.isArray(
          path === "/api/ai-field-detection/runs" ? body.runs : body.items,
        )
      )
        throw new Error(`Workflow API ${path} returned an invalid list.`);
    } else if (!managementPageReady(path, await response.text())) {
      throw new Error(
        `The deployed management page ${path} is missing its expected heading.`,
      );
    }
    console.log(`Authenticated workflow smoke check passed: ${path}`);
  }

  const fillResponse = await fetch(
    `https://${hostname}/fill/deployment-check`,
    {
      redirect: "manual",
    },
  );
  if ([301, 302, 303, 307, 308].includes(fillResponse.status)) {
    throw new Error(
      "The public recipient fill route was unexpectedly redirected.",
    );
  }

  const gazetteerResponse = await fetch(
    `https://${hostname}/api/gazetteer?level=province`,
    { redirect: "manual" },
  );
  if ([301, 302, 303, 307, 308].includes(gazetteerResponse.status)) {
    throw new Error("The public Gazetteer API was unexpectedly redirected.");
  }
}

async function waitForResponse(url, options, accepted) {
  let lastResponse;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    lastResponse = await fetch(url, options);
    if (await accepted(lastResponse)) return lastResponse;
    if (attempt < 12)
      await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  throw new Error(
    `Deployment verification did not stabilize for ${url}; last HTTP status was ${lastResponse?.status ?? "unknown"}.`,
  );
}

function responseCookieHeader(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const values = setCookies.length
    ? setCookies
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = values.map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookie)
    throw new Error("Better Auth sign-in did not issue a session cookie.");
  return cookie;
}

function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(48)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function cloudflareApi(path, options = {}) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const details = (payload.errors ?? [])
      .map((error) => `${error.code}: ${error.message}`)
      .join("; ");
    throw new Error(
      `Cloudflare API request failed (${response.status}): ${details || "Unknown error"}`,
    );
  }
  return payload.result;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}.`,
    );
  }
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
