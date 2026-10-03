import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { workspaceSetup } from "@/features/hr/setup.server";
import { SetupChecklist } from "@/features/hr/setup-checklist";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/setup");
  return (
    <AppShell displayName={owner.displayName}>
      <PageHeader
        title="Workspace setup"
        description="Get ready to receive CVs, prepare candidates, and collect forms."
      />
      <SetupChecklist data={await workspaceSetup(owner.email)} />
    </AppShell>
  );
}
