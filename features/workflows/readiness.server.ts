import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { templates, templateVersions } from "@/db/schema";
import { botConfiguration } from "@/features/telegram/bot.server";
import { parseVersionRoles } from "@/features/templates/template-write";
import { getWorkflow, fail } from "./workflow.server";
import { parseDraftGraph, type WorkflowGraph } from "./workflow";
export type ReadinessIssue = {
  nodeId?: string;
  message: string;
  href?: string;
  actionLabel?: string;
};
export async function workflowReadiness(
  owner: string,
  id: string,
  draft?: unknown,
) {
  const workflow = await getWorkflow(owner, id);
  const graph: WorkflowGraph | null =
    draft === undefined ? (workflow.published ?? null) : parseDraftGraph(draft);
  if (!graph) fail("Choose a valid draft or publish a workflow first.", 422);
  const issues: ReadinessIssue[] = [];
  const bot = botConfiguration();
  if (
    graph.nodes.some(
      (n) =>
        n.kind === "resume_uploaded" &&
        n.config.trigger === "telegram_submission",
    ) &&
    !bot.configured
  ) {
    issues.push({
      message:
        "Telegram intake bot configuration is incomplete. Ask your administrator to configure the recruitment bot before candidates submit CVs.",
      href: "/intake",
      actionLabel: "Open intake setup",
    });
  }
  for (const node of graph.nodes) {
    if (node.kind === "send_telegram" && !bot.configured)
      issues.push({
        message:
          "Telegram bot configuration is incomplete. Ask your administrator to configure the recruitment bot before invitations can be sent.",
        href: "/intake",
        actionLabel: "Open intake setup",
      });
    if (node.kind !== "assign_forms") continue;
    if (!node.config.forms?.length)
      issues.push({
        nodeId: node.id,
        message: "Choose at least one published form.",
      });
    for (const target of node.config.forms ?? []) {
      const [form] = await getDb()
        .select({ name: templates.name, roles: templateVersions.rolesJson })
        .from(templates)
        .innerJoin(
          templateVersions,
          eq(
            templateVersions.id,
            draft === undefined && target.versionId
              ? target.versionId
              : templates.currentVersionId,
          ),
        )
        .where(
          and(
            eq(templates.id, target.templateId),
            eq(templates.ownerEmail, owner),
            eq(templateVersions.templateId, templates.id),
            isNull(templates.archivedAt),
          ),
        )
        .limit(1);
      if (
        !form ||
        !parseVersionRoles(form.roles).some((r) => r.id === target.roleId)
      )
        issues.push({
          nodeId: node.id,
          message: `${target.name ?? "Selected form"} is unpublished, archived, or unavailable. Choose an available published form.`,
          href: "/forms",
        });
    }
  }
  return {
    issues,
    checkedAt: new Date().toISOString(),
    requiresTelegram: graph.nodes.some((n) => n.kind === "send_telegram"),
  };
}
