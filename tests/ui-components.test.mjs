import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /page-thumbnail-settle/);
  assert.match(css, /copy-link-success/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(React.createElement(Progress, { value: 37 }));

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("composes shadcn card slots without custom dashboard markup", async () => {
  const { Card, CardContent, CardHeader, CardTitle } = await vite.ssrLoadModule(
    "/components/ui/card.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(
      Card,
      null,
      React.createElement(
        CardHeader,
        null,
        React.createElement(CardTitle, null, "Template"),
      ),
      React.createElement(CardContent, null, "Details"),
    ),
  );

  assert.match(html, /data-slot="card"/);
  assert.match(html, /data-slot="card-header"/);
  assert.match(html, /data-slot="card-title"/);
  assert.match(html, /data-slot="card-content"/);
});

test("composes the shared data table from shadcn card and table primitives", async () => {
  const { DataTable } = await vite.ssrLoadModule(
    "/components/ui/data-table.tsx",
  );
  const columns = [
    {
      id: "name",
      header: "Template",
      cell: (row) => row.name,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => row.status,
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      columns,
      data: [{ id: "template-1", name: "Employee form", status: "Active" }],
      getRowId: (row) => row.id,
      caption: "Templates",
      emptyTitle: "No templates",
      emptyDescription: "Create your first template.",
    }),
  );

  assert.match(html, /data-slot="card"/);
  assert.match(html, /data-slot="table"/);
  assert.match(html, /data-slot="table-header"/);
  assert.match(html, /Employee form/);
  assert.match(html, /Active/);
});

test("keeps the data table structure visible for empty results", async () => {
  const { DataTable } = await vite.ssrLoadModule(
    "/components/ui/data-table.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      columns: [{ id: "name", header: "Template", cell: () => "" }],
      data: [],
      getRowId: (row) => row.id,
      caption: "Templates",
      emptyTitle: "No templates",
      emptyDescription: "Create your first template.",
    }),
  );

  assert.match(html, /data-slot="table-head"/);
  assert.match(html, /colSpan="1"/);
  assert.match(html, /No templates/);
  assert.match(html, /Create your first template/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});
