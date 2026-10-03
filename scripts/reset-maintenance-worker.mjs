import { buildResetPlan } from "./reset-plan.mjs";

const maintenanceWorker = {
  async fetch(request, env) {
    if (request.method !== "POST" || !env.PRODUCTION_RESET_TOKEN ||
        request.headers.get("Authorization") !== `Bearer ${env.PRODUCTION_RESET_TOKEN}`) {
      return new Response("Maintenance in progress. Please try again shortly.", {
        status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      });
    }
    const path = new URL(request.url).pathname;
    if (path === "/__reset/database") {
      const { results: rows } = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT IN ('d1_migrations', '__drizzle_migrations') ORDER BY name",
      ).all();
      const tables = rows.map((row) => row.name);
      // Refuse to operate against an unrelated or unmigrated database.
      for (const required of ["user", "resumes", "workflows", "audit_events"]) {
        if (!tables.includes(required)) throw new Error("Expected application schema is missing.");
      }
      const { results: triggers } = await env.DB.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL",
      ).all();
      const foreignKeys = {};
      for (const table of tables) {
        if (!/^[a-z_][a-z0-9_]*$/iu.test(table)) throw new Error("Unexpected table name.");
        const { results } = await env.DB.prepare(`PRAGMA foreign_key_list("${table}")`).all();
        foreignKeys[table] = results.map((row) => row.table);
      }
      // D1 batch is transactional: data and protective triggers change together.
      await env.DB.batch(buildResetPlan({ tables, triggers, foreignKeys }).map(
        (sql) => env.DB.prepare(sql),
      ));
      const counts = await env.DB.batch(tables.map(
        (table) => env.DB.prepare(`SELECT COUNT(*) AS total FROM "${table}"`),
      ));
      if (counts.some((result) => result.results[0].total !== 0)) {
        throw new Error("Database is not empty after reset.");
      }
      const { results: restored } = await env.DB.prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL",
      ).all();
      if (triggers.some((before) => !restored.some(
        (after) => after.name === before.name && after.sql === before.sql,
      ))) throw new Error("Database protection verification failed.");
      return Response.json({ clearedTables: tables.length, restoredTriggers: restored.length });
    }
    if (path === "/__reset/files") {
      const objects = await env.FILES.list({ limit: 500 });
      if (objects.objects.length) await env.FILES.delete(objects.objects.map((object) => object.key));
      return Response.json({ deleted: objects.objects.length });
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled() {},
  async queue(batch) { batch.ackAll(); },
};

export default maintenanceWorker;
