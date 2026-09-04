import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ACCOUNT_ID = requiredEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID");
const API_TOKEN = requiredEnvironmentVariable("CLOUDFLARE_API_TOKEN");
const MANAGEMENT_EMAIL = requiredEnvironmentVariable("MANAGEMENT_EMAIL");

const WORKER_NAME = "pdf-builder";
const DATABASE_NAME = "pdf-builder-db";
const BUCKET_NAME = "pdf-builder-files";
const WRANGLER_CONFIG_PATH = "wrangler.jsonc";

await main();

async function main() {
  console.log("Preparing the single production environment...");

  const [database, workersSubdomain] = await Promise.all([
    ensureD1Database(),
    getWorkersSubdomain(),
  ]);
  await ensureR2Bucket();

  const hostname = `${WORKER_NAME}.${workersSubdomain}.workers.dev`;
  await configureAccess(hostname);
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
  run("npx", ["wrangler", "deploy", "--config", WRANGLER_CONFIG_PATH]);

  await verifyDeployment(hostname);
  console.log(`Production deployment verified: https://${hostname}`);
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

async function configureAccess(hostname) {
  const applications = await cloudflareApi("/access/apps?per_page=100");
  const definitions = [
    {
      name: "PDF Builder production",
      domain: `${hostname}/*`,
      decision: "allow",
      include: [{ email: { email: MANAGEMENT_EMAIL } }],
    },
    {
      name: "PDF Builder public fill pages",
      domain: `${hostname}/fill*`,
      decision: "bypass",
      include: [{ everyone: {} }],
    },
    {
      name: "PDF Builder public fill API",
      domain: `${hostname}/api/fill*`,
      decision: "bypass",
      include: [{ everyone: {} }],
    },
    {
      name: "PDF Builder public Gazetteer API",
      domain: `${hostname}/api/gazetteer*`,
      decision: "bypass",
      include: [{ everyone: {} }],
    },
    {
      name: "PDF Builder public assets",
      domain: `${hostname}/assets*`,
      decision: "bypass",
      include: [{ everyone: {} }],
    },
  ];

  for (const definition of definitions) {
    const existing = applications.find((application) => application.name === definition.name);
    const body = {
      name: definition.name,
      type: "self_hosted",
      domain: definition.domain,
      session_duration: "24h",
      app_launcher_visible: false,
      policies: [
        {
          name: `${definition.name} policy`,
          decision: definition.decision,
          precedence: 1,
          include: definition.include,
        },
      ],
    };

    if (existing) {
      await cloudflareApi(`/access/apps/${existing.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      console.log(`Updated Cloudflare Access rule: ${definition.domain}`);
    } else {
      await cloudflareApi("/access/apps", {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`Created Cloudflare Access rule: ${definition.domain}`);
    }
  }
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

async function verifyDeployment(hostname) {
  const rootResponse = await fetch(`https://${hostname}/`, { redirect: "manual" });
  if (![301, 302, 303, 307, 308].includes(rootResponse.status)) {
    throw new Error(`Expected Cloudflare Access on the editor, received HTTP ${rootResponse.status}.`);
  }

  const fillResponse = await fetch(`https://${hostname}/fill/deployment-check`, {
    redirect: "manual",
  });
  if ([301, 302, 303, 307, 308].includes(fillResponse.status)) {
    throw new Error("The public recipient fill route was redirected to Cloudflare Access.");
  }

  const gazetteerResponse = await fetch(
    `https://${hostname}/api/gazetteer?level=province`,
    { redirect: "manual" },
  );
  if ([301, 302, 303, 307, 308].includes(gazetteerResponse.status)) {
    throw new Error("The public Gazetteer API was redirected to Cloudflare Access.");
  }
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
