import "server-only";
import Link from "next/link";
import { getDatabaseBinding } from "@/db";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
export async function candidateApplications(
  owner: string,
  candidateId: string,
) {
  return (
    await getDatabaseBinding()
      .prepare(
        "SELECT a.id,c.full_name name,COALESCE(j.title,'Legacy / unassigned job') jobTitle,a.outcome,a.stage_id stageId FROM hiring_applications a JOIN candidates c ON c.id=a.candidate_id AND c.owner_email=a.owner_email LEFT JOIN hiring_jobs j ON j.id=a.job_id AND j.owner_email=a.owner_email WHERE a.owner_email=? AND a.candidate_id=? ORDER BY a.created_at DESC,a.id",
      )
      .bind(owner, candidateId)
      .all<{
        id: string;
        name: string;
        jobTitle: string;
        outcome: string | null;
        stageId: string;
      }>()
  ).results;
}
export function ApplicationChooser({
  items,
  candidateId,
  displayName,
}: {
  items: Awaited<ReturnType<typeof candidateApplications>>;
  candidateId: string;
  displayName: string;
}) {
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="Choose application"
        description="This candidate has more than one hiring application. Select the job whose stage, documents and interviews you want to manage."
      />
      <div className="space-y-4">
        {items.map((app) => (
          <article className="space-y-3 rounded-xl border p-5" key={app.id}>
            <h2 className="font-semibold">
              {app.name} · {app.jobTitle}
            </h2>
            <p className="text-sm">{app.outcome ?? "Active"}</p>
            <Button asChild>
              <Link href={`/hiring/${app.id}`}>Open application</Link>
            </Button>
          </article>
        ))}
        <Button variant="outline" asChild>
          <Link href={`/candidates/${candidateId}?legacy=1`}>
            Shared candidate profile & original records
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
