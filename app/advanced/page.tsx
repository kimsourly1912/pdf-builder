import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
export default async function Page() {
  const owner = await requireChatGPTUser("/advanced");
  return <AppShell displayName={owner.displayName}><PageHeader title="Advanced document tools" description="Use these tools for existing PDF-based forms and direct PDF editing." /><div className="grid gap-4 sm:grid-cols-2">{[
    { title: "PDF templates", description: "Manage existing forms that candidates fill directly on the PDF, including their recipient assignments.", href: "/templates" },
    { title: "PDF studio", description: "Upload and edit a PDF with positioned input fields.", href: "/studio" },
  ].map((tool) => <section key={tool.href} className="rounded-xl border bg-card p-5"><h2 className="font-semibold">{tool.title}</h2><p className="my-3 text-sm text-muted-foreground">{tool.description}</p><Button asChild variant="outline"><Link href={tool.href}>Open {tool.title.toLowerCase()}</Link></Button></section>)}</div><p className="text-sm text-muted-foreground">For a new questionnaire, start with <Link className="underline" href="/forms">Form templates</Link>. Candidates answer a clean web form, and you can add PDF output when needed.</p></AppShell>;
}
