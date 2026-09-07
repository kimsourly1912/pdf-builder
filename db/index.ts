import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DatabaseBatchResult = {
  success: boolean;
  meta?: { changes?: number };
};

export type DatabaseStatement = {
  bind(...values: unknown[]): DatabaseStatement;
};

export type DatabaseBinding = {
  prepare(query: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<DatabaseBatchResult[]>;
};

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getDatabaseBinding(): DatabaseBinding {
  const runtime = env as unknown as { DB?: DatabaseBinding };
  if (!runtime.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }
  return runtime.DB;
}
