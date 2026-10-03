import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { getDatabaseBinding } from "@/db";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { definitionSchema } from "@/features/forms/form";
import { CandidatePreview } from "@/features/hr/candidate-preview";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ form?: string }>;
}) {
  const owner = await requireChatGPTUser("/setup/preview");
  const query = await searchParams;
  const { results } = await getDatabaseBinding()
    .prepare(
      "SELECT t.id,t.name,t.description,v.form_definition_json definition FROM templates t JOIN template_versions v ON v.id=t.current_version_id AND v.template_id=t.id WHERE t.owner_email=? AND t.kind='form' AND t.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='template' AND a.entity_id=t.id) ORDER BY t.updated_at DESC,t.id",
    )
    .bind(owner.email)
    .all<{
      id: string;
      name: string;
      description: string;
      definition: string;
    }>();
  const forms = results.map((form) => {
    const definition = definitionSchema.parse(JSON.parse(form.definition));
    return {
      ...form,
      definition,
      name: definition.presentation?.title ?? form.name,
      description: definition.presentation?.description ?? form.description,
    };
  });
  const selected = query.form
    ? forms.find((f) => f.id === query.form)
    : forms[0];
  return (
    <AppShell displayName={owner.displayName}>
      <Link className="text-sm underline" href="/setup">
        ← Workspace setup
      </Link>
      <PageHeader
        title="Preview candidate journey"
        description="Check the candidate experience before inviting anyone."
      />
      <div
        className="flex flex-wrap gap-2"
        aria-label="Choose a published form"
      >
        {forms.map((f) => (
          <Button
            asChild
            className="h-auto max-w-full whitespace-normal break-words text-left"
            variant={f.id === selected?.id ? "default" : "outline"}
            key={f.id}
          >
            <Link
              href={`/setup/preview?form=${encodeURIComponent(f.id)}`}
              aria-current={f.id === selected?.id ? "page" : undefined}
            >
              {f.name}
            </Link>
          </Button>
        ))}
      </div>
      <CandidatePreview key={selected?.id ?? "empty"} form={selected ?? null} />
    </AppShell>
  );
}
