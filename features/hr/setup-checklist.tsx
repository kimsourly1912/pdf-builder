import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { workspaceSetup } from "./setup.server";

export function SetupChecklist({
  data,
}: {
  data: Awaited<ReturnType<typeof workspaceSetup>>;
}) {
  const steps = [
    {
      title: "Connect Telegram intake",
      done: data.bot.configured,
      description: data.bot.configured
        ? `@${data.bot.username} is configured. Check the bot yourself before sharing its link.`
        : "Configure the recruitment bot in secure deployment settings. You can still review staff-uploaded CVs without Telegram.",
      href: "/intake",
      action: data.bot.configured
        ? "Open incoming candidates"
        : "Check Telegram setup",
    },
    {
      title: "Publish a form",
      done: data.forms.length > 0,
      description:
        "Build questions and preview them. Publishing makes a form available to assign; it does not send it to anyone.",
      href: "/forms",
      action: data.forms.length
        ? "Open form templates"
        : "Create a form template",
    },
    {
      title: "Configure candidate preparation",
      done: !!data.preparationId,
      description:
        "Choose when account and form preparation starts. The readiness check includes selected forms and any required Telegram configuration.",
      href: data.preparationId
        ? `/workflows/${data.preparationId}`
        : "/workflows/new",
      action: data.preparationId
        ? "Check preparation workflow"
        : "Set up preparation",
    },
  ];
  return (
    <section aria-label="Workspace readiness" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {steps.filter((s) => s.done).length} of 3 setup checks complete. These
        checks inspect configuration; they do not send messages, create
        candidates, or use AI.
      </p>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center"
          >
            <div className="min-w-0">
              <h2 className="font-semibold">
                {i + 1}. {step.title}{" "}
                <span className="ml-2 text-xs text-muted-foreground">
                  {step.done ? "Configured" : "Setup needed"}
                </span>
              </h2>
              <p className="mt-2 max-w-2xl break-words text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
            <Button
              asChild
              variant={step.done ? "outline" : "default"}
              className="shrink-0 self-start"
            >
              <Link href={step.href}>{step.action}</Link>
            </Button>
          </li>
        ))}
      </ol>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Preview the candidate experience</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          See the activation → forms → confirmation journey and try a published
          form. Sample answers stay in your browser.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/setup/preview">Preview candidate journey</Link>
        </Button>
      </div>
    </section>
  );
}
