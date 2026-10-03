"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Pencil, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { createPageMeta } from "@/features/pagination/pagination";
import type { PageMeta } from "@/features/pagination/pagination";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchiveButton } from "@/features/archive/archive-button";
import { formApi } from "./client";
type Item = {
  id: string;
  name: string;
  description: string;
  versionId: string;
  fileName: string;
  updatedAt: string;
};
export function FormsDashboard(props: { displayName: string }) {
  const router = useRouter(),
    [items, setItems] = useState<Item[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [meta, setMeta] = useState<PageMeta>(
      createPageMeta(0, { page: 1, pageSize: 25 }),
    );
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await formApi<{ items: Item[] } & PageMeta>(
        `/api/forms?page=${page}&search=${encodeURIComponent(search)}`,
      );
      if (id === requestId.current) {
        setItems(data.items);
        setMeta(data);
        setError("");
      }
    } catch (e) {
      if (id === requestId.current)
        setError(e instanceof Error ? e.message : "Could not load forms.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, search]);
  const invalidateRequests = useCallback(() => {
    ++requestId.current;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timer);
      invalidateRequests();
    };
  }, [load, invalidateRequests]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await formApi<{ id: string }>("/api/forms", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled form" }),
      });
      router.push(`/forms/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create form.");
      setBusy(false);
    }
  }
  const filtered = items;
  return (
    <AppShell displayName={props.displayName}>
      <PageHeader
        title="Form templates"
        description="Create reusable forms, publish them, and assign them to candidates. A completed PDF is optional."
        actions={
          <Button disabled={busy} onClick={() => void create()}>
            <Plus />
            {busy ? "Creating…" : "Create form"}
          </Button>
        }
      />
      <Input
        aria-label="Search forms"
        placeholder="Search forms…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-md"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            Retry loading forms
          </Button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading forms…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <FileText className="mx-auto mb-4 size-8 text-muted-foreground" />
          <h2 className="font-semibold">
            {search ? "No matching forms" : "Build your first form"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add fields, configure autofill, and attach a PDF when you need a
            completed document.
          </p>
          <Button
            className="mt-5"
            disabled={busy}
            onClick={() => {
              if (search) {
                setSearch("");
                setPage(1);
              } else void create();
            }}
          >
            {search ? "Clear search" : "Create form"}
          </Button>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="min-w-0 rounded-xl border bg-card p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-lg font-semibold">
                  {item.name}
                </h2>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">
                  {item.versionId ? "Ready to assign" : "Draft"}
                </span>
              </div>
              <p className="mb-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                {item.description || "No instructions yet"}
              </p>
              <p
                className="mb-4 truncate text-xs text-muted-foreground"
                title={item.fileName}
              >
                {item.fileName || "Web form · PDF optional"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/forms/${item.id}`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/forms/${item.id}/responses`}>
                    <Send />
                    Assignments & answers
                  </Link>
                </Button>
                <ArchiveButton
                  type="template"
                  id={item.id}
                  label={item.name}
                  onArchived={() => {
                    void load();
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      <ServerPagination
        meta={meta}
        onPageChange={setPage}
        disabled={busy || loading}
      />
    </AppShell>
  );
}
