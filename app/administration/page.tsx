import Link from "next/link";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { botConfiguration } from "@/features/telegram/bot.server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const owner = await requireChatGPTUser("/administration"),
    bot = botConfiguration();
  return (
    <AppShell displayName={owner.displayName}>
      <PageHeader
        title="Administration"
        description="Manage access, integrations, and retained history."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          {
            title: "Account access",
            description:
              "Manage candidate and internal form accounts, activation, and access.",
            href: "/accounts",
          },
          {
            title: "Telegram intake",
            description: bot.username
              ? `Recruitment bot: @${bot.username}. Share its link and confirm candidate contacts before invitations.`
              : "Recruitment bot is not connected. Ask your administrator to finish setup before sharing its link.",
            href: "/intake",
          },
          {
            title: "Activity",
            description: "Review recorded changes and decisions.",
            href: "/activity",
          },
          {
            title: "Archive",
            description:
              "Restore archived records and inspect protected-history restrictions.",
            href: "/archive",
          },
          {
            title: "AI history",
            description:
              "View previous AI analyses. New CV extraction remains an explicit paid action.",
            href: "/analyses",
          },
        ].map((item) => (
          <Link
            href={item.href}
            key={item.title}
            className="rounded-xl border bg-card p-6 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            <h2 className="font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {item.description}
            </p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
