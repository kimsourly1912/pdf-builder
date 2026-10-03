import Link from "next/link";
import {
  FileText,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { MetricCard } from "@/components/patterns/metric-card";
import { Button } from "@/components/ui/button";
import type { hrHome } from "./home.server";
export function HrHome({
  displayName,
  data,
}: {
  displayName: string;
  data: Awaited<ReturnType<typeof hrHome>>;
}) {
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="HR Home"
        description="Review candidates, collect documents, and see what needs your attention."
        actions={
          <Button asChild>
            <Link href="/candidates">Open candidates</Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "CVs to review",
            value: data.counts.newCvs,
            href: "/needs-attention?type=cv_review",
            icon: <FileText />,
          },
          {
            label: "Needs attention",
            value: data.counts.attention,
            href: "/needs-attention",
            icon: <AlertTriangle />,
          },
          {
            label: "Awaiting forms",
            value: data.counts.awaitingForms,
            href: "/needs-attention?type=pending_forms",
            icon: <ClipboardList />,
          },
          {
            label: "Forms to review",
            value: data.counts.review,
            href: "/submissions?status=pending",
            icon: <CheckCircle2 />,
          },
        ].map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
          >
            <MetricCard label={m.label} value={m.value} icon={m.icon} />
          </Link>
        ))}
      </div>
      <section
        id="daily-tasks"
        className="scroll-mt-20 rounded-xl border bg-card p-5 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Work needing attention</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.total
                ? `${data.total} tasks · Issues first, then longest waiting. Showing up to 20.`
                : "You’re up to date. New candidates and form submissions will appear here."}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/needs-attention">View all attention tasks</Link>
          </Button>
        </div>
        <div className="divide-y">
          {data.tasks.map((task) => (
            <div
              key={task.id}
              className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{task.name}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {task.detail}
                </p>
                <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">
                  {task.reason}
                </p>
              </div>
              <Button
                asChild
                variant={task.urgent ? "default" : "outline"}
                className="shrink-0 self-start"
              >
                <Link href={task.href}>{task.action}</Link>
              </Button>
            </div>
          ))}
        </div>
        {!data.total && (
          <div className="flex flex-wrap gap-3 py-4">
            <Button asChild variant="outline">
              <Link href="/resumes">Upload a CV</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/forms">Create a form template</Link>
            </Button>
          </div>
        )}
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/resumes" className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">CV library</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Review staff uploads and manually verify details. AI is optional.
          </p>
        </Link>
        <Link href="/forms" className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Forms & documents</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Build reusable forms, map PDF output, and collect responses.
          </p>
        </Link>
      </div>
    </AppShell>
  );
}
