import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const ACCOUNT_ID = requiredEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
const API_TOKEN = requiredEnvironmentVariable("CLOUDFLARE_API_TOKEN");
const MANAGEMENT_EMAIL = requiredEnvironmentVariable("MANAGEMENT_EMAIL");
const OWNER_PASSWORD = requiredEnvironmentVariable("OWNER_PASSWORD");

const WORKER_NAME = "pdf-builder";
const DATABASE_NAME = "pdf-builder-db";
const BUCKET_NAME = "pdf-builder-files";
const WRANGLER_CONFIG_PATH = "wrangler.jsonc";
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

  const hostname = `${WORKER_NAME}.${workersSubdomain}.workers.dev`;
  await ensureAuthenticationBypass(hostname);
  writeProductionDatabaseId(database.uuid);

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
  const bootstrapToken = randomSecret();
  await putWorkerSecret("AUTH_BOOTSTRAP_TOKEN", bootstrapToken);
  run("npx", ["wrangler", "deploy", "--config", WRANGLER_CONFIG_PATH]);

  let authenticatedCookie;
  try {
    authenticatedCookie = await bootstrapAndSignInOwner(hostname, bootstrapToken);
  } finally {
    await deleteWorkerSecret("AUTH_BOOTSTRAP_TOKEN");
  }

  await removeLegacyAccessApplications();
  await verifyDeployment(hostname, authenticatedCookie);
  const productionUrl = `https://${hostname}`;
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `PRODUCTION_URL=${productionUrl}\n`, "utf8");
  }
  console.log(`Production deployment verified: ${productionUrl}`);
}

async function ensureD1Database() {
  const query = new URLSearchParams({ name: DATABASE_NAME, per_page: "100" });
  const databases = await cloudflareApi(`/d1/database?${query}`);
  const existing = databases.find((database) => database.name === DATABASE_NAME);
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

async function getWorkersSubdomain() {
  const result = await cloudflareApi("/workers/subdomain");
  if (!result.subdomain) {
    throw new Error("Cloudflare Workers subdomain is not configured for this account.");
  }
  return result.subdomain;
}

async function ensureAuthenticationBypass(hostname) {
  const applications = await cloudflareApi("/access/apps?per_page=100");
  const name = "PDF Builder public authentication";
  const domain = `${hostname}/api/auth*`;
  const existing = applications.find((application) => application.name === name);
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
    console.log(`Removed legacy Cloudflare Access application: ${application.name}`);
  }
}

async function ensurePersistentAuthSecret() {
  const secrets = await cloudflareApi(`/workers/scripts/${WORKER_NAME}/secrets`);
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
  const signUpResponse = await fetch(`${origin}/api/auth/sign-up/email`, {
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
  if (!signUpResponse.ok && signUpResponse.status !== 422) {
    throw new Error(
      `Owner bootstrap failed with HTTP ${signUpResponse.status}: ${await signUpResponse.text()}`,
    );
  }
  console.log(
    signUpResponse.ok
      ? "Created the Better Auth owner account."
      : "The Better Auth owner account already exists.",
  );

  const signInResponse = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: MANAGEMENT_EMAIL,
      password: OWNER_PASSWORD,
      rememberMe: true,
    }),
  });
  if (!signInResponse.ok) {
    throw new Error(
      `Owner sign-in verification failed with HTTP ${signInResponse.status}. Ensure PDF_BUILDER_OWNER_PASSWORD matches the deployed owner account.`,
    );
  }

  const cookie = responseCookieHeader(signInResponse);
  const sessionResponse = await fetch(`${origin}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  });
  const session = await sessionResponse.json();
  if (
    !sessionResponse.ok ||
    session?.user?.email?.trim().toLowerCase() !== MANAGEMENT_EMAIL.toLowerCase()
  ) {
    throw new Error("Better Auth did not return the expected owner session.");
  }
  console.log("Verified the Better Auth owner session.");
  return cookie;
}

function writeProductionDatabaseId(databaseId) {
  const config = readFileSync(WRANGLER_CONFIG_PATH, "utf8");
  const updated = config.replace(
    /("database_name"\s*:\s*"pdf-builder-db"[\s\S]*?"database_id"\s*:\s*)"[^"]+"/u,
    `$1"${databaseId}"`,
  );

  if (updated === config) {
    throw new Error("Could not inject the production D1 database ID into wrangler.jsonc.");
  }
  writeFileSync(WRANGLER_CONFIG_PATH, updated, "utf8");
}

async function verifyDeployment(hostname, authenticatedCookie) {
  const rootResponse = await fetch(`https://${hostname}/`, { redirect: "manual" });
  const rootLocation = rootResponse.headers.get("location") ?? "";
  if (
    ![301, 302, 303, 307, 308].includes(rootResponse.status) ||
    !rootLocation.includes("/sign-in")
  ) {
    throw new Error(`Expected the editor to redirect to application sign-in, received HTTP ${rootResponse.status}.`);
  }

  const managementResponse = await fetch(`https://${hostname}/api/templates`, {
    redirect: "manual",
  });
  if (managementResponse.status !== 401) {
    throw new Error(`Expected unauthenticated management API HTTP 401, received ${managementResponse.status}.`);
  }

  const authenticatedResponse = await fetch(`https://${hostname}/api/templates`, {
    headers: { Cookie: authenticatedCookie },
  });
  if (!authenticatedResponse.ok) {
    throw new Error(`Authenticated management API failed with HTTP ${authenticatedResponse.status}.`);
  }

  const fillResponse = await fetch(`https://${hostname}/fill/deployment-check`, {
    redirect: "manual",
  });
  if ([301, 302, 303, 307, 308].includes(fillResponse.status)) {
    throw new Error("The public recipient fill route was unexpectedly redirected.");
  }

  const gazetteerResponse = await fetch(
    `https://${hostname}/api/gazetteer?level=province`,
    { redirect: "manual" },
  );
  if ([301, 302, 303, 307, 308].includes(gazetteerResponse.status)) {
    throw new Error("The public Gazetteer API was unexpectedly redirected.");
  }
}

function responseCookieHeader(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const values = setCookies.length
    ? setCookies
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = values.map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookie) throw new Error("Better Auth sign-in did not issue a session cookie.");
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
    throw new Error(`Cloudflare API request failed (${response.status}): ${details || "Unknown error"}`);
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
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

function requiredEnvironmentVariable(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
