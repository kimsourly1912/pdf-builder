import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});
const pagination = await vite.ssrLoadModule("/features/pagination/pagination.ts");

after(async () => vite.close());

test("page queries use safe defaults and a sort allowlist", () => {
  const query = pagination.parsePageQuery(new URLSearchParams("page=-3&pageSize=nope&sort=secret&order=sideways"), {
    sorts: ["createdAt", "name"],
    defaultSort: "createdAt",
  });
  assert.deepEqual(query, {
    page: 1,
    pageSize: 25,
    offset: 0,
    sort: "createdAt",
    order: "desc",
  });
});

test("page queries cap size and calculate offsets", () => {
  const query = pagination.parsePageQuery(new URLSearchParams("page=4&pageSize=500&sort=name&order=asc"), {
    sorts: ["createdAt", "name"],
    defaultSort: "createdAt",
    maxPageSize: 100,
  });
  assert.equal(query.pageSize, 100);
  assert.equal(query.offset, 300);
  assert.equal(query.sort, "name");
  assert.equal(query.order, "asc");
});

test("page metadata reports totals and navigation state", () => {
  assert.deepEqual(pagination.createPageMeta(51, { page: 2, pageSize: 25 }), {
    page: 2,
    pageSize: 25,
    totalItems: 51,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
  });
});

test("client metadata returns to the final valid page after deletions", () => {
  const fallback = pagination.createPageMeta(75, { page: 3, pageSize: 25 });
  const normalized = pagination.pageMetaFromPayload({
    page: 3,
    pageSize: 25,
    totalItems: 24,
    totalPages: 1,
    hasPreviousPage: true,
    hasNextPage: false,
  }, fallback);
  assert.equal(normalized.page, 1);
  assert.equal(normalized.hasPreviousPage, false);
});

test("owner list APIs use bounded SQL pagination and stable ordering", () => {
  const sources = [
    read("app/api/templates/route.ts"),
    read("app/api/submissions/route.ts"),
    read("app/api/accounts/route.ts"),
    read("app/api/resumes/route.ts"),
    read("app/api/audit-events/route.ts"),
  ];
  for (const source of sources) {
    assert.match(source, /parsePageQuery/u);
    assert.match(source, /createPageMeta/u);
    assert.match(source, /pageQuery\.pageSize/u);
    assert.match(source, /pageQuery\.offset/u);
    assert.match(source, /private, no-store/u);
  }
});

test("resume metrics are calculated across the filtered result set", () => {
  const route = read("app/api/resumes/route.ts");
  assert.match(route, /sum\(case when/u);
  assert.doesNotMatch(route, /total: items\.length/u);
});

test("list screens use the shared server pagination control", () => {
  const screens = [
    read("features/templates/templates-dashboard.tsx"),
    read("features/accounts/accounts-dashboard.tsx"),
    read("features/resumes/resume-library.tsx"),
    read("features/audit/audit-log.tsx"),
  ];
  for (const screen of screens) assert.match(screen, /<ServerPagination/u);
  assert.match(read("components/patterns/server-pagination.tsx"), /Results per page/u);
});

test("P4 migration adds indexes for default paginated ordering", () => {
  const migration = read("drizzle/0015_p4_server_pagination.sql");
  assert.match(migration, /templates_owner_archived_updated_idx/u);
  assert.match(migration, /resumes_owner_received_created_idx/u);
});
