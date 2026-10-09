"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Plus, Download, MoreHorizontal } from "lucide-react";
import { ServerPagination } from "@/components/patterns/server-pagination";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import {
  createPageMeta,
  type PageMeta,
} from "@/features/pagination/pagination";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { ArchiveButton } from "@/features/archive/archive-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { RecipientAccountSummary } from "@/features/accounts/account.types";
import { useUrlFilters } from "@/features/candidate-progress/use-url-filters";
import { FormAccountPicker } from "./form-account-picker";
import { formApi } from "./client";
type Answer = {
  fieldId: string;
  key: string;
  label: string;
  type: string;
  value: unknown;
  displayValue?: string;
};
type Item = {
  id: string;
  name: string;
  email: string;
  accountType: string | null;
  submittedAt: string;
  answers: Answer[];
  pdfStatus: string | null;
  reviewStatus: string;
  pdfError?: string | null;
};
type AssignedPerson = {
  id: string;
  name: string;
  email: string;
  accountType: string;
  assignedAt: string;
  completedAt: string | null;
  status: string;
  linkStatus: string;
  version: number;
};
function accountLabel(type: string | null) {
  return type === "candidate"
    ? "Candidate"
    : type === "employee"
      ? "Employee"
      : "Account unavailable";
}
function reviewLabel(status: string) {
  return status === "accepted"
    ? "Accepted"
    : status === "corrections_requested"
      ? "Changes requested"
      : "Needs review";
}
function reviewColor(status: string) {
  return status === "accepted"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}
function answerContent(answer: Answer) {
  if (
    answer.value === null ||
    answer.value === undefined ||
    answer.value === "" ||
    (Array.isArray(answer.value) && !answer.value.length)
  )
    return <span className="italic text-muted-foreground">Not answered</span>;
  if (answer.displayValue) return answer.displayValue;
  if (typeof answer.value === "boolean") return answer.value ? "Yes" : "No";
  if (Array.isArray(answer.value)) return answer.value.join(", ");
  if (typeof answer.value === "object" && "url" in answer.value)
    return (
      <a
        className="text-primary underline"
        href={String(answer.value.url)}
        target="_blank"
        rel="noopener noreferrer"
      >
        View uploaded image
      </a>
    );
  return String(answer.value);
}
const RESPONSE_FILTERS = {
  responseSearch: "",
  responseAccount: "",
  responseReview: "",
  responseTab: "responses",
  responsePage: "1",
};
function validResponseFilter(
  key: keyof typeof RESPONSE_FILTERS,
  value: string,
) {
  return key === "responseAccount"
    ? ["", "candidate", "employee"].includes(value)
    : key === "responseReview"
      ? ["", "pending", "accepted", "corrections_requested"].includes(value)
      : key === "responseTab"
        ? ["responses", "people"].includes(value)
        : key === "responsePage"
          ? /^\d{1,6}$/.test(value) && Number(value) > 0
          : value.length <= 120;
}
export function FormResponses(props: {
  id: string;
  displayName: string;
  preferenceKey: string;
}) {
  const searchParams = useSearchParams();
  const requestedResponse = searchParams.get("response");
  const [items, setItems] = useState<Item[]>([]),
    [people, setPeople] = useState<AssignedPerson[]>([]);
  const [name, setName] = useState("Form responses"),
    [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [assignedLink, setAssignedLink] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    requestedResponse,
  );
  const {
    filters,
    setFilters,
    ready: filtersReady,
  } = useUrlFilters(RESPONSE_FILTERS, validResponseFilter, props.preferenceKey);
  const tab = filters.responseTab,
    search = filters.responseSearch,
    accountType = filters.responseAccount,
    reviewStatus = filters.responseReview,
    page = Number(filters.responsePage);
  const setTab = (value: string) => setFilters({ responseTab: value });
  const setSearch = (value: string) => setFilters({ responseSearch: value });
  const setAccountType = (value: string) =>
    setFilters({ responseAccount: value });
  const setReviewStatus = (value: string) =>
    setFilters({ responseReview: value });
  const setPage = (value: number) =>
    setFilters({ responsePage: String(value) });
  const [meta, setMeta] = useState<PageMeta>(
    createPageMeta(0, { page: 1, pageSize: 25 }),
  );
  const [assignOpen, setAssignOpen] = useState(false),
    [account, setAccount] = useState<RecipientAccountSummary | null>(null),
    [assignError, setAssignError] = useState("");
  const published = publishedVersion !== null;
  const loadSequence = useRef(0);
  const assignTrigger = useRef<HTMLButtonElement>(null);
  const selected = items.find((item) => item.id === selectedId);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const sequence = ++loadSequence.current;
      const params = new URLSearchParams({
        page: String(page),
        search,
        accountType,
      });
      if (tab === "responses") {
        params.set("reviewStatus", reviewStatus);
        if (requestedResponse) params.set("response", requestedResponse);
      }
      const [responses, form] = await Promise.all([
        formApi<({ items: Item[] } | { items: AssignedPerson[] }) & PageMeta>(
          `/api/forms/${props.id}/${tab === "responses" ? "responses" : "assignments"}?${params}`,
          { signal },
        ),
        formApi<{ name: string; publishedVersion: number | null }>(
          `/api/forms/${props.id}`,
          { signal },
        ),
      ]);
      if (signal?.aborted || sequence !== loadSequence.current) return;
      if (tab === "responses") setItems(responses.items as Item[]);
      else setPeople(responses.items as AssignedPerson[]);
      setMeta(responses);
      setName(form.name);
      setPublishedVersion(form.publishedVersion);
      setLoading(false);
    },
    [props.id, page, requestedResponse, tab, search, accountType, reviewStatus],
  );
  useEffect(() => {
    if (!filtersReady) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void load(controller.signal).catch((cause: Error) => {
        if (!controller.signal.aborted) {
          setError(cause.message);
          setLoading(false);
        }
      });
    }, 200);
    const refresh = setInterval(
      () => void load(controller.signal).catch(() => {}),
      15000,
    );
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(refresh);
    };
  }, [load, filtersReady]);
  const assign = async () => {
    if (!account) return;
    setBusy(true);
    setAssignError("");
    setMessage("");
    setAssignedLink("");
    try {
      const result = await formApi<{ assignment: { id: string } }>(
        `/api/forms/${props.id}/assign`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ email: account.email }),
        },
      );
      setMessage(
        `Assigned to ${account.name} (${account.email}). No invitation was sent.`,
      );
      if (result.assignment?.id)
        setAssignedLink(`/fill/assigned_${result.assignment.id}`);
      setAssignOpen(false);
      setAccount(null);
      await load();
    } catch (cause) {
      setAssignError(
        cause instanceof Error ? cause.message : "Assignment failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const retry = async (item: Item) => {
    setBusy(true);
    setError("");
    try {
      await formApi(`/api/forms/submissions/${item.id}/pdf`, {
        method: "POST",
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "PDF retry failed. Answers remain saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const exportJson = (item: Item) => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              submissionId: item.id,
              email: item.email,
              submittedAt: item.submittedAt,
              answers: Object.fromEntries(
                item.answers.map((answer) => [answer.key, answer.value]),
              ),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}-${item.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const clearFilters = () => {
    setSearch("");
    setAccountType("");
    setReviewStatus("");
    setPage(1);
  };
  return (
    <AppShell displayName={props.displayName}>
      <Link href="/forms" className="text-sm text-muted-foreground">
        ← Form templates
      </Link>
      <PageHeader
        title={name}
        description="Review responses and assign this form to existing accounts."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/forms/${props.id}`}>Edit form</Link>
            </Button>
            <Button
              ref={assignTrigger}
              disabled={busy || !published}
              onClick={() => {
                setAssignError("");
                setAccount(null);
                setAssignOpen(true);
              }}
            >
              <Plus />
              Assign form
            </Button>
          </>
        }
      />
      {!loading && !published && (
        <p className="text-sm text-muted-foreground">
          Publish the form before assigning it.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive p-3 text-sm text-destructive"
        >
          <p>{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch(() => {})
            }
          >
            Try again
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="rounded-lg border p-3 text-sm">
          {message}
        </p>
      )}
      {assignedLink && (
        <section
          className="space-y-3 rounded-lg border bg-card p-4"
          aria-label="Share form access"
        >
          <p className="text-sm">
            Available in their My forms page. You can also share the
            account-protected link.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(new URL(assignedLink, window.location.origin).href)
                  .then(() =>
                    setMessage("Form link copied. Sign-in is required."),
                  )
                  .catch(() =>
                    setError(
                      "Copy failed. Open the form link and copy its address.",
                    ),
                  )
              }
            >
              Copy form link
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={assignedLink}>Open form link</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/candidates">Open Candidate Preparation</Link>
            </Button>
          </div>
        </section>
      )}
      <div className="space-y-4">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            setPage(1);
            setSelectedId(null);
            setLoading(true);
          }}
        >
          <TabsList className="gap-2">
            <TabsTrigger value="responses">Responses</TabsTrigger>
            <TabsTrigger value="people">Assigned people</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="response-search">Find a person</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                id="response-search"
                placeholder="Search name or email…"
                value={search}
                className="pl-9"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                  setSelectedId(null);
                  setLoading(true);
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="response-account-type">Account type</Label>
            <SelectField
              id="response-account-type"
              placeholder="All account types"
              value={accountType}
              onValueChange={(value) => {
                setAccountType(value);
                setPage(1);
                setSelectedId(null);
                setLoading(true);
              }}
            >
              <SelectFieldOption value="">All account types</SelectFieldOption>
              <SelectFieldOption value="candidate">Candidate</SelectFieldOption>
              <SelectFieldOption value="employee">Employee</SelectFieldOption>
            </SelectField>
          </div>
          {tab === "responses" && (
            <div className="space-y-2">
              <Label htmlFor="response-review-status">Review status</Label>
              <SelectField
                id="response-review-status"
                placeholder="All review statuses"
                value={reviewStatus}
                onValueChange={(value) => {
                  setReviewStatus(value);
                  setPage(1);
                  setSelectedId(null);
                  setLoading(true);
                }}
              >
                <SelectFieldOption value="">
                  All review statuses
                </SelectFieldOption>
                <SelectFieldOption value="pending">
                  Needs review
                </SelectFieldOption>
                <SelectFieldOption value="accepted">Accepted</SelectFieldOption>
                <SelectFieldOption value="corrections_requested">
                  Changes requested
                </SelectFieldOption>
              </SelectField>
            </div>
          )}
          {(search || accountType || reviewStatus) && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        {requestedResponse && tab === "responses" && (
          <p className="text-sm text-muted-foreground">
            Showing the linked response.{" "}
            <Link href={`/forms/${props.id}/responses`} className="underline">
              View all responses
            </Link>
          </p>
        )}
        <div
          className={`grid min-w-0 gap-6 ${selected && tab === "responses" ? "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : "grid-cols-1"}`}
        >
          <section
            className="min-w-0 rounded-xl border bg-card p-4"
            aria-label={
              tab === "responses" ? "Submitted responses" : "Assigned people"
            }
          >
            <h2 className="mb-4 font-semibold">
              {tab === "responses" ? "Submitted responses" : "Assigned people"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {meta.totalItems}{" "}
                {tab === "responses" ? "responses" : "assignments"}
              </span>
            </h2>
            {loading ? (
              <p
                role="status"
                className="py-10 text-center text-sm text-muted-foreground"
              >
                Loading…
              </p>
            ) : (tab === "responses" ? items.length : people.length) === 0 ? (
              <div className="space-y-2 py-10 text-center">
                <p className="font-medium">
                  {search || accountType || reviewStatus
                    ? "No matches"
                    : tab === "responses"
                      ? "No responses yet"
                      : "No assigned people yet"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {search || accountType || reviewStatus
                    ? "Change or clear your filters."
                    : tab === "responses"
                      ? "Submitted forms will appear here for HR review."
                      : "Assign this form to an existing account to get started."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="px-3 py-3">Person</th>
                      <th className="px-3 py-3">Account type</th>
                      <th className="px-3 py-3">
                        {tab === "responses" ? "Review status" : "Form status"}
                      </th>
                      <th className="px-3 py-3">
                        {tab === "responses" ? "Submitted" : "Assigned"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tab === "responses"
                      ? items.map((item) => (
                          <tr
                            key={item.id}
                            className={`border-b last:border-0 ${item.id === selectedId ? "bg-primary/5" : "hover:bg-muted/50"}`}
                          >
                            <td className="p-3">
                              <Button
                                variant="link"
                                aria-pressed={item.id === selectedId}
                                className="block h-auto max-w-64 space-y-1 whitespace-normal px-0 text-left font-normal focus-visible:outline-primary"
                                onClick={() => setSelectedId(item.id)}
                              >
                                <span className="block break-words font-medium text-primary">
                                  {item.name || "Unnamed account"}
                                </span>
                                <span className="block break-all text-xs text-muted-foreground">
                                  {item.email}
                                </span>
                              </Button>
                            </td>
                            <td className="p-3">
                              <Badge variant="secondary">
                                {accountLabel(item.accountType)}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="outline"
                                className={reviewColor(item.reviewStatus)}
                              >
                                {reviewLabel(item.reviewStatus)}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(item.submittedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      : people.map((person) => (
                          <tr
                            key={person.id}
                            className="border-b last:border-0"
                          >
                            <td className="p-3">
                              <p className="break-words font-medium">
                                {person.name}
                              </p>
                              <p className="break-all text-xs text-muted-foreground">
                                {person.email}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Form v{person.version}
                              </p>
                            </td>
                            <td className="p-3">
                              <Badge variant="secondary">
                                {accountLabel(person.accountType)}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline">
                                {person.completedAt
                                  ? "Submitted"
                                  : person.status === "cancelled" ||
                                      person.linkStatus === "revoked"
                                    ? "Cancelled"
                                    : person.linkStatus === "expired"
                                      ? "Expired"
                                      : "Waiting for response"}
                              </Badge>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">
                              {new Date(person.assignedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
            <ServerPagination
              meta={meta}
              onPageChange={(value) => {
                setPage(value);
                setSelectedId(null);
                setLoading(true);
              }}
              disabled={busy || loading}
            />
          </section>
          {selected && tab === "responses" && (
            <section
              className="min-w-0 space-y-5 rounded-xl border bg-card p-5"
              aria-label="Response details"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="break-words text-lg font-semibold">
                    {selected.name}
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedId(null)}
                  >
                    Close
                  </Button>
                </div>
                <p className="break-all text-sm text-muted-foreground">
                  {selected.email}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {accountLabel(selected.accountType)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={reviewColor(selected.reviewStatus)}
                  >
                    {reviewLabel(selected.reviewStatus)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(selected.submittedAt).toLocaleString()}
                </p>
              </div>
              <Button asChild className="w-full">
                <Link href={`/submissions/${selected.id}/review`}>
                  {selected.reviewStatus === "pending"
                    ? "Review response"
                    : "View HR decision"}
                </Link>
              </Button>
              <dl className="space-y-4 border-t pt-4">
                {selected.answers.map((answer) => (
                  <div key={answer.fieldId} className="space-y-1">
                    <dt className="text-sm font-medium">{answer.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {answerContent(answer)}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="space-y-3 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  {selected.pdfStatus === "ready"
                    ? "PDF ready"
                    : selected.pdfStatus === "not_configured"
                      ? "Web form · no PDF output configured"
                      : selected.pdfStatus === "failed"
                        ? "PDF unavailable · answers remain saved"
                        : "PDF processing · answers remain saved"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.pdfStatus === "ready" ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={`/api/forms/submissions/${selected.id}/pdf`}
                        download
                      >
                        <Download />
                        Download PDF
                      </a>
                    </Button>
                  ) : (
                    selected.pdfStatus !== "not_configured" && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void retry(selected)}
                      >
                        Retry PDF
                      </Button>
                    )
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal />
                        More actions
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => exportJson(selected)}>
                        Export JSON
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <ArchiveButton
                    type="submission"
                    id={selected.id}
                    label={`${name} — ${selected.name}`}
                    onArchived={() => {
                      setSelectedId(null);
                      void load();
                    }}
                  />
                </div>
                {selected.pdfError && (
                  <p className="text-xs text-muted-foreground">
                    {selected.pdfError === "text_overflow"
                      ? "An answer exceeds this published PDF box. Retrying cannot change its layout; enlarge the placement for future assignments."
                      : "PDF generation failed. Retry when resources are available."}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
      <Dialog
        open={assignOpen}
        onOpenChange={(open) => {
          if (!busy) setAssignOpen(open);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={(event) => { event.preventDefault(); assignTrigger.current?.focus(); }}>
          <DialogHeader>
            <DialogTitle>Assign {name}</DialogTitle>
            <DialogDescription>
              Choose an existing account. They can fill in the whole form.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={account ? undefined : "assignment-account-search"}>
              Find account
            </Label>
            <FormAccountPicker
              key={assignOpen ? "open" : "closed"}
              formId={props.id}
              version={publishedVersion}
              selected={account}
              onSelect={setAccount}
              disabled={busy}
            />
          </div>
          {assignError && (
            <p role="alert" className="text-sm text-destructive">
              {assignError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Assignment does not send an invitation.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setAssignOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={busy || !account} onClick={() => void assign()}>
              {busy ? "Assigning…" : "Assign form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
