"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ServerPagination } from "@/components/patterns/server-pagination";
import { createPageMeta } from "@/features/pagination/pagination";
import type { PageMeta } from "@/features/pagination/pagination";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { ArchiveButton } from "@/features/archive/archive-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  submittedAt: string;
  answers: Answer[];
  pdfStatus: string | null;
  reviewStatus: string;
  pdfError?: string | null;
};
export function FormResponses(props: { id: string; displayName: string }) {
  const searchParams = useSearchParams();
  const requestedResponse = searchParams.get("response");
  const [items, setItems] = useState<Item[]>([]),
    [name, setName] = useState("Form responses"),
    [published, setPublished] = useState(false),
    [assignedLink, setAssignedLink] = useState(""),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(requestedResponse),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [meta, setMeta] = useState<PageMeta>(
      createPageMeta(0, { page: 1, pageSize: 25 }),
    );
  const selected = items.find((item) => item.id === selectedId);
  const load = useCallback(
    () =>
      Promise.all([
        formApi<{ items: Item[] } & PageMeta>(
          `/api/forms/${props.id}/responses?page=${page}${requestedResponse ? `&response=${encodeURIComponent(requestedResponse)}` : ""}`,
        ),
        formApi<{ name: string; publishedVersion: number | null }>(
          `/api/forms/${props.id}`,
        ),
      ]).then(([responses, form]) => {
        setItems(responses.items);
        setMeta(responses);
        setName(form.name);
        setPublished(Boolean(form.publishedVersion));
        setLoading(false);
      }),
    [props.id, page, requestedResponse],
  );
  useEffect(() => {
    void load().catch((e: Error) => {
      setError(e.message);
      setLoading(false);
    });
    const timer = setInterval(() => {
      void load().catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  const assign = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    setAssignedLink("");
    try {
      const result = await formApi<{ assignment: { id: string } }>(
        `/api/forms/${props.id}/assign`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ email }),
        },
      );
      setMessage(
        `Assigned to ${email}. Available in My forms. No invitation was sent.`,
      );
      if (result.assignment?.id)
        setAssignedLink(`/fill/assigned_${result.assignment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assignment failed.");
    } finally {
      setBusy(false);
    }
  };
  const retry = async (item: Item) => {
    setBusy(true);
    try {
      await formApi(`/api/forms/submissions/${item.id}/pdf`, {
        method: "POST",
        body: "{}",
      });
      await load();
      setMessage("PDF generation retried. Your saved answers were retained.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF retry failed.");
    } finally {
      setBusy(false);
    }
  };
  const exportJson = (item: Item) => {
    const data = {
      submissionId: item.id,
      email: item.email,
      submittedAt: item.submittedAt,
      answers: Object.fromEntries(item.answers.map((a) => [a.key, a.value])),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `response-${item.id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <AppShell displayName={props.displayName}>
      <PageHeader
        title={name}
        description="Assign this form, share access, and review saved answers. PDF output is optional."
        actions={
          <Button asChild variant="outline">
            <Link href={`/forms/${props.id}`}>Edit form</Link>
          </Button>
        }
      />
      <div className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 font-semibold">Assign form</h2>
        {published ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void assign();
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="min-w-0 flex-1">
              <Label htmlFor="assignment-email">Account email</Label>
              <Input
                id="assignment-email"
                type="email"
                required
                placeholder="candidate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button disabled={busy}>{busy ? "Working…" : "Assign form"}</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Publish the form before assigning it.{" "}
            <Link
              className="text-primary underline"
              href={`/forms/${props.id}`}
            >
              Open builder
            </Link>
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Check the account email before assigning. The user completes the
          entire form. Assignment does not send a message. For candidate review
          and first-time invitations, use the candidate profile. New users need
          an account first.{" "}
          <Link href="/accounts" className="underline">
            Account access
          </Link>
        </p>
      </div>
      {assignedLink && (
        <section
          aria-label="Share assigned form"
          className="rounded-xl border bg-card p-5"
        >
          <h2 className="font-semibold">Next: share access</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Share this account-protected link with the assigned user. They must
            sign in; first-time candidate activation is handled by their
            preparation invitation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(window.location.origin + assignedLink)
                  .then(() =>
                    setMessage("Form link copied. No message was sent."),
                  )
                  .catch(() =>
                    setError("Copy failed. Select and copy the link below."),
                  );
              }}
            >
              Copy form link
            </Button>
            <Button asChild variant="outline">
              <Link href="/candidates">Open candidates</Link>
            </Button>
          </div>
          <p className="mt-3 break-all text-xs text-muted-foreground">
            {assignedLink}
          </p>
        </section>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="break-words rounded-md border p-3 text-sm">
          {message}
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-semibold">Submitted responses</h2>
          {requestedResponse && (
            <Button asChild variant="outline" className="mb-4">
              <Link href={`/forms/${props.id}/responses`}>
                Show all responses
              </Link>
            </Button>
          )}
          {loading ? (
            <p>Loading…</p>
          ) : !items.length ? (
            <p className="text-sm text-muted-foreground">
              No responses yet. Assign this form to a user to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-lg border p-4 text-left ${selected?.id === item.id ? "border-primary bg-primary/5" : ""}`}
                >
                  <span className="block font-medium">{item.name}</span>
                  <span className="block break-all text-sm text-muted-foreground">
                    {item.email}
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {item.reviewStatus === "accepted"
                      ? "Accepted by HR"
                      : item.reviewStatus === "corrections_requested"
                        ? "Corrections requested"
                        : "Awaiting HR review"}{" "}
                    · {new Date(item.submittedAt).toLocaleString()} ·{" "}
                    {item.pdfStatus === "ready"
                      ? "PDF ready"
                      : item.pdfStatus === "failed"
                        ? "PDF needs retry"
                        : item.pdfStatus === "not_configured"
                          ? "JSON response"
                          : "PDF preparing"}
                  </span>
                </button>
              ))}
            </div>
          )}
          <ServerPagination
            meta={meta}
            onPageChange={setPage}
            disabled={busy || loading}
          />
        </section>
        <section className="min-w-0 rounded-xl border bg-card p-5">
          <h2 className="mb-4 font-semibold">
            {selected ? `${selected.name} — Submitted` : "Response details"}
          </h2>
          {selected ? (
            <>
              <div className="mb-5 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/submissions/${selected.id}/review`}>
                    {selected.reviewStatus === "pending"
                      ? "Review submission"
                      : "View HR decision"}
                  </Link>
                </Button>
                <ArchiveButton
                  type="submission"
                  id={selected.id}
                  label={`${name} — ${selected.name}`}
                  onArchived={() => {
                    setSelectedId(null);
                    void load();
                  }}
                />
                <Button variant="outline" onClick={() => exportJson(selected)}>
                  Export JSON
                </Button>
                {selected.pdfStatus === "ready" ? (
                  <Button asChild variant="outline">
                    <a
                      href={`/api/forms/submissions/${selected.id}/pdf`}
                      download
                    >
                      Download PDF
                    </a>
                  </Button>
                ) : (
                  selected.pdfStatus !== "not_configured" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void retry(selected)}
                    >
                      Retry PDF
                    </Button>
                  )
                )}
              </div>
              {selected.pdfError && (
                <p role="status" className="mb-5 rounded-md border p-3 text-sm">
                  {selected.pdfError === "text_overflow"
                    ? "An answer exceeds its published PDF box. Your JSON is complete; this version needs a larger placement before a future assignment. Retrying preserves this version and cannot change its layout."
                    : "PDF generation failed. Your answers are saved; retry when storage and PDF resources are available."}
                </p>
              )}
              <dl className="space-y-4">
                {selected.answers.map((a) => (
                  <div key={a.fieldId}>
                    <dt className="text-sm font-medium">{a.label}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {a.displayValue ??
                        (a.value &&
                        typeof a.value === "object" &&
                        !Array.isArray(a.value) ? (
                          <a
                            className="text-primary underline"
                            href={String(
                              (a.value as { url?: string }).url ?? "",
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View uploaded image
                          </a>
                        ) : Array.isArray(a.value) ? (
                          a.value.join(", ")
                        ) : (
                          String(a.value ?? "")
                        ))}
                    </dd>
                    <span className="text-xs text-muted-foreground">
                      {a.key}
                    </span>
                  </div>
                ))}
              </dl>
              <details className="mt-6">
                <summary className="cursor-pointer text-sm font-medium">
                  View JSON
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(
                    Object.fromEntries(
                      selected.answers.map((a) => [a.key, a.value]),
                    ),
                    null,
                    2,
                  )}
                </pre>
              </details>
              <p className="mt-5 text-xs text-muted-foreground">
                Answers stay saved even when PDF generation needs a retry.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a response to view its answers and outputs.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
