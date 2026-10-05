"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RecipientAccountSummary } from "@/features/accounts/account.types";
import type { PageMeta } from "@/features/pagination/pagination";
import { formApi } from "./client";

export function FormAccountPicker({
  formId,
  version,
  selected,
  onSelect,
  disabled,
}: {
  formId: string;
  version: number | null;
  selected: RecipientAccountSummary | null;
  onSelect: (account: RecipientAccountSummary | null) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RecipientAccountSummary[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void formApi<{ items: RecipientAccountSummary[] } & PageMeta>(
        `/api/accounts?sort=name&order=asc&pageSize=20&page=${page}&search=${encodeURIComponent(search)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (controller.signal.aborted) return;
          setItems((old) =>
            page === 1 ? data.items : [...old, ...data.items],
          );
          setHasNext(data.hasNextPage);
          setLoading(false);
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          setError(
            cause instanceof Error
              ? cause.message
              : "Accounts could not be loaded.",
          );
          setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, attempt]);
  if (selected)
    return (
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{selected.name}</p>
          <p className="break-all text-sm text-muted-foreground">
            {selected.email}
          </p>
          <Badge variant="secondary">
            {selected.accountType === "candidate" ? "Candidate" : "Employee"}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(null)}
        >
          Change
        </Button>
      </div>
    );
  return (
    <div className="space-y-3">
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput
          id="assignment-account-search"
          aria-label="Find account by name or email"
          placeholder="Search name or email…"
          value={search}
          disabled={disabled}
          onValueChange={(value) => {
            setSearch(value);
            setPage(1);
            setItems([]);
            setLoading(true);
          }}
        />
        <CommandList aria-label="Matching accounts" className="max-h-64">
          {items.map((account) => {
            const assigned = account.assignments.some(
              (assignment) =>
                assignment.templateId === formId &&
                assignment.versionNumber === version,
            );
            return (
              <CommandItem
                key={account.id}
                value={account.id}
                disabled={disabled || assigned || loading}
                onSelect={() => onSelect(account)}
                className="flex items-center justify-between gap-3 p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {account.name}
                  </span>
                  <span className="block break-all text-xs text-muted-foreground">
                    {account.email}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="secondary">
                    {account.accountType === "candidate"
                      ? "Candidate"
                      : "Employee"}
                  </Badge>
                  {assigned && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Check className="size-3" />
                      Already assigned
                    </span>
                  )}
                </span>
              </CommandItem>
            );
          })}
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 p-3 text-sm text-muted-foreground"
            >
              <LoaderCircle className="size-4 animate-spin" />
              Finding accounts…
            </p>
          )}
          {!loading && !items.length && !error && (
            <p className="p-4 text-sm text-muted-foreground">
              No matching accounts. Try a different name or email.
            </p>
          )}
        </CommandList>
      </Command>
      {error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      )}
      {hasNext && (
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setPage((value) => value + 1)}
        >
          Load more accounts
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        New user?{" "}
        <Link href="/accounts" className="underline">
          Create their account first
        </Link>
        . Candidate invitations are managed from the candidate profile.
      </p>
    </div>
  );
}
