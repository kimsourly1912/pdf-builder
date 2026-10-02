"use client";

import {
  Check,
  ChevronsUpDown,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CandidateProfileOption } from "@/features/accounts/account.types";
import { cn } from "@/lib/utils";

type ProfilePage = {
  items?: CandidateProfileOption[];
  page?: number;
  totalItems?: number;
  totalPages?: number;
  error?: string;
};

export function CandidateProfileCombobox(props: {
  accountId: string;
  value: string | null;
  onValueChange: (
    value: string | null,
    option: CandidateProfileOption | null,
  ) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CandidateProfileOption[]>([]);
  const [selected, setSelected] = useState<CandidateProfileOption | null>(null);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeSelected = props.value ? selected : null;

  useEffect(() => {
    if (!open || props.disabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (search.trim()) query.set("search", search.trim());
      if (linkedOnly) query.set("linkedOnly", "true");
      if (verifiedOnly) query.set("verifiedOnly", "true");
      void fetch(
        `/api/accounts/${props.accountId}/candidate-profiles?${query}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          const payload = await response.json() as ProfilePage;
          if (!response.ok) {
            throw new Error(
              payload.error || "Candidate profiles could not be loaded.",
            );
          }
          const nextItems = payload.items ?? [];
          setItems((current) => page === 1
            ? nextItems
            : [
                ...current,
                ...nextItems.filter(
                  (item) => !current.some((existing) => existing.id === item.id),
                ),
              ]);
          setTotalItems(payload.totalItems ?? nextItems.length);
          setTotalPages(Math.max(1, payload.totalPages ?? 1));
          if (props.value) {
            const current = nextItems.find((item) => item.id === props.value);
            if (current) setSelected(current);
          }
        })
        .catch((cause) => {
          if (controller.signal.aborted) return;
          if (page === 1) setItems([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "Candidate profiles could not be loaded.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    open,
    search,
    page,
    linkedOnly,
    verifiedOnly,
    props.accountId,
    props.disabled,
    props.value,
  ]);

  function startNewSearch(value: string) {
    setSearch(value);
    setPage(1);
    setItems([]);
  }

  function toggleLinked() {
    setLinkedOnly((current) => !current);
    setPage(1);
    setItems([]);
  }

  function toggleVerified() {
    setVerifiedOnly((current) => !current);
    setPage(1);
    setItems([]);
  }

  const triggerLabel = activeSelected
    ? `${activeSelected.candidateName} · ${activeSelected.fileName || `profile v${activeSelected.versionNumber}`}`
    : "Choose resume data";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Choose resume data"
          disabled={props.disabled}
          className="h-9 w-full min-w-0 justify-between px-3 font-normal"
        >
          <span className={cn(
            "truncate",
            !activeSelected && "text-muted-foreground",
          )}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(34rem,calc(100vw-2rem))] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={startNewSearch}
            placeholder="Search name, email, phone, filename, position…"
          />
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant={linkedOnly ? "default" : "outline"}
              onClick={toggleLinked}
              className="h-7 text-[11px]"
            >
              Linked to account
            </Button>
            <Button
              type="button"
              size="sm"
              variant={verifiedOnly ? "default" : "outline"}
              onClick={toggleVerified}
              className="h-7 text-[11px]"
            >
              Verified only
            </Button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {totalItems} profile{totalItems === 1 ? "" : "s"}
            </span>
          </div>
          <CommandList className="max-h-96">
            {loading && page === 1 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Searching resumes…
              </div>
            ) : error && items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-destructive">
                {error}
              </p>
            ) : items.length === 0 ? (
              <CommandEmpty className="block">
                No matching resume profiles.
              </CommandEmpty>
            ) : (
              <>
                <CommandGroup heading="Candidate profiles">
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => {
                        setSelected(item);
                        props.onValueChange(item.id, item);
                        setOpen(false);
                      }}
                      className="items-start py-2.5"
                    >
                      <Check className={cn(
                        "mt-0.5 size-4",
                        props.value === item.id
                          ? "opacity-100"
                          : "opacity-0",
                      )} />
                      <FileText className="mt-0.5 size-4" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">
                            {item.candidateName}
                          </span>
                          <span className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                            item.verificationStatus === "verified"
                              ? "border-success/30 bg-success/10 text-success"
                              : "border-warning/30 bg-warning/10 text-warning",
                          )}>
                            {item.verificationStatus}
                          </span>
                          {item.linkedToAccount && (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">
                              Linked
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {item.email || item.phone || "No contact details"}
                          {" · "}profile v{item.versionNumber}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {item.fileName || "Candidate profile"}
                          {item.appliedPosition
                            ? ` · ${item.appliedPosition}`
                            : ""}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {page < totalPages && (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={loading}
                      onClick={() => setPage((current) => current + 1)}
                      className="w-full"
                    >
                      {loading && <LoaderCircle className="size-4 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
                {error && (
                  <p className="border-t px-3 py-2 text-center text-xs text-destructive">
                    {error}
                  </p>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
