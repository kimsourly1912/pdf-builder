import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
export function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync(new URL("../../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL("../../drizzle/" + f, import.meta.url), "utf8"),
    );
  class Statement {
    constructor(query, values = []) {
      this.query = query;
      this.values = values;
    }
    bind(...values) {
      return new Statement(this.query, values);
    }
    async all() {
      const statement = sqlite.prepare(this.query);
      const results = statement.all(...this.values);
      return {
        success: true,
        results,
        meta: { changes: sqlite.prepare("SELECT changes() n").get().n },
      };
    }
    async raw() {
      const statement = sqlite.prepare(this.query);
      statement.setReturnArrays(true);
      return statement.all(...this.values);
    }
    async first(column) {
      const row = sqlite.prepare(this.query).get(...this.values);
      return row ? (column ? row[column] : row) : null;
    }
    async run() {
      return this.all();
    }
  }
  return {
    sqlite,
    prepare: (query) => new Statement(query),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) results.push(await s.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    close() {
      sqlite.close();
    },
  };
}
