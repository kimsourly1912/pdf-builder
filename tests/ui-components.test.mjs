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

test("keeps AI field results inside a scrollable dialog body", async () => {
  const source = await readFile(
    path.join(
      root,
      "features/ai-field-detection/ai-field-detection-dialog.tsx",
    ),
    "utf8",
  );

  assert.match(source, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
  assert.match(
    source,
    /overflow-x-hidden overflow-y-auto overscroll-contain/,
  );
  assert.match(source, /\[scrollbar-gutter:stable\]/);
  assert.match(
    source,
    /<DialogFooter className="border-t bg-background px-5 py-4">/,
  );
});

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

test("composes reusable dashboard patterns from shadcn primitives", async () => {
  const { FeedbackAlert } = await vite.ssrLoadModule(
    "/components/patterns/feedback-alert.tsx",
  );
  const { MetricCard } = await vite.ssrLoadModule(
    "/components/patterns/metric-card.tsx",
  );
  const { PageHeader } = await vite.ssrLoadModule(
    "/components/patterns/page-header.tsx",
  );
  const { StatusBadge } = await vite.ssrLoadModule(
    "/components/patterns/status-badge.tsx",
  );
  const { DataView, DataViewContent, DataViewHeader } =
    await vite.ssrLoadModule("/components/patterns/data-view.tsx");

  const html = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(PageHeader, {
        eyebrow: "HR forms",
        title: "Templates",
        description: "Manage reusable forms.",
      }),
      React.createElement(MetricCard, {
        label: "Submissions",
        value: 12,
        icon: React.createElement("span", null, "S"),
        tone: "success",
      }),
      React.createElement(FeedbackAlert, {
        title: "Updated successfully",
        description: "The template was archived.",
        tone: "success",
      }),
      React.createElement(StatusBadge, {
        label: "Active",
        tone: "info",
      }),
      React.createElement(
        DataView,
        null,
        React.createElement(DataViewHeader, null, "Toolbar"),
        React.createElement(DataViewContent, null, "Results"),
      ),
    ),
  );

  assert.match(html, /data-slot="page-header"/);
  assert.match(html, /data-slot="metric-card"/);
  assert.match(html, /data-slot="feedback-alert"/);
  assert.match(html, /role="status"/);
  assert.match(html, /data-slot="status-badge"/);
  assert.match(html, /Active/);
  assert.match(html, /data-slot="data-view"/);
  assert.match(html, /data-slot="data-view-header"/);
  assert.match(html, /data-slot="data-view-content"/);
});

test("composes the shared data table from shadcn card and table primitives", async () => {
  const { DataTable } = await vite.ssrLoadModule(
    "/components/ui/data-table.tsx",
  );
  const columns = [
    {
      accessorKey: "name",
      header: "Template",
    },
    {
      accessorKey: "status",
      header: "Status",
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
      filterColumn: "name",
      filterPlaceholder: "Filter templates...",
      enableRowSelection: true,
    }),
  );

  assert.match(html, /data-slot="card"/);
  assert.match(html, /data-slot="table"/);
  assert.match(html, /data-slot="table-header"/);
  assert.match(html, /Employee form/);
  assert.match(html, /Active/);
  assert.match(html, /Filter templates/);
  assert.match(html, /Columns/);
  assert.match(html, /Select all rows on this page/);
  assert.match(html, /Previous page/);
  assert.match(html, /Next page/);
});

test("keeps the data table structure visible for empty results", async () => {
  const { DataTable } = await vite.ssrLoadModule(
    "/components/ui/data-table.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      columns: [{ accessorKey: "name", header: "Template" }],
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
  assert.match(html, /data-slot="empty"/);
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
