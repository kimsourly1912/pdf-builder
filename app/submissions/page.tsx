import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reviewInbox } from "@/features/hr/review-inbox.server";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const owner = await requireChatGPTUser("/submissions"),
    raw = await searchParams,
    params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw))
    if (typeof value === "string") params.set(key, value);
  const data = await reviewInbox(owner.email, params);
  const link = (status: string, page = 1) =>
    `/submissions?${new URLSearchParams({ status, search: data.search, page: String(page) })}`;
  return (
    <AppShell displayName={owner.displayName}>
      <PageHeader
        title="Form review inbox"
        description="Review submitted answers, accept documents, or request a corrected attempt."
      />
      <div className="flex flex-wrap gap-2">
        {[
          { status: "pending", label: "Awaiting review" },
          { status: "accepted", label: "Accepted" },
          { status: "corrections_requested", label: "Corrections requested" },
        ].map((s) => (
          <Button
            asChild
            key={s.status}
            variant={data.status === s.status ? "default" : "outline"}
          >
            <Link href={link(s.status)}>{s.label}</Link>
          </Button>
        ))}
      </div>
      <form className="flex flex-wrap items-end gap-3" action="/submissions">
        <input type="hidden" name="status" value={data.status} />
        <div className="min-w-0 flex-1">
          <Label htmlFor="review-search">Search name, email, or form</Label>
          <Input id="review-search" name="search" defaultValue={data.search} />
        </div>
        <Button variant="outline">Search</Button>
        {data.search && (
          <Button asChild variant="ghost">
            <Link href={`/submissions?status=${data.status}`}>Clear</Link>
          </Button>
        )}
      </form>
      <section className="rounded-xl border bg-card p-5">
        <p className="mb-4 text-sm text-muted-foreground">
          {data.total} submissions · Page {data.page} of {data.totalPages}
        </p>
        <div className="space-y-3">
          {data.items.map((i) => (
            <div
              key={i.id}
              className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <h2 className="break-words font-medium">{i.name || i.email}</h2>
                <p className="break-words text-sm text-muted-foreground">
                  {i.formName} · v{i.versionNumber}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  {i.email} · Submitted {new Date(i.at).toLocaleString()}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/submissions/${i.id}/review`}>
                  {data.status === "pending"
                    ? "Review submission"
                    : "View decision"}
                </Link>
              </Button>
            </div>
          ))}
        </div>
        {!data.items.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No submissions match this view. Candidate responses will appear
            after submission.
          </p>
        )}
        <div className="mt-5 flex justify-between gap-3">
          {data.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={link(data.status, data.page - 1)}>Previous</Link>
            </Button>
          ) : (
            <span />
          )}
          {data.page < data.totalPages && (
            <Button asChild variant="outline">
              <Link href={link(data.status, data.page + 1)}>Next</Link>
            </Button>
          )}
        </div>
      </section>
    </AppShell>
  );
}
