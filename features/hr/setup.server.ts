import "server-only";
import { getDatabaseBinding } from "@/db";
import { botConfiguration } from "@/features/telegram/bot.server";
import { workflowReadiness } from "@/features/workflows/readiness.server";
import { parseGraph } from "@/features/workflows/workflow";

export async function workspaceSetup(owner: string) {
  const db = getDatabaseBinding();
  const [forms, workflows] = await Promise.all([
    db
      .prepare(
        "SELECT t.id,t.name FROM templates t JOIN template_versions v ON v.id=t.current_version_id AND v.template_id=t.id WHERE t.owner_email=? AND t.kind='form' AND t.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='template' AND a.entity_id=t.id) ORDER BY t.updated_at DESC,t.id",
      )
      .bind(owner)
      .all<{ id: string; name: string }>(),
    db
      .prepare(
        "SELECT w.id,w.published_json graph FROM workflows w WHERE w.owner_email=? AND w.active=1 AND w.published_json IS NOT NULL AND NOT EXISTS(SELECT 1 FROM archive_records a WHERE a.entity_type='workflow' AND a.entity_id=w.id) ORDER BY w.updated_at DESC,w.id",
      )
      .bind(owner)
      .all<{ id: string; graph: string }>(),
  ]);
  let preparationId: string | null = null;
  for (const workflow of workflows.results) {
    const graph = parseGraph(JSON.parse(workflow.graph));
    if (!graph || !graph.nodes.some((n) => n.kind === "assign_forms")) continue;
    if (!(await workflowReadiness(owner, workflow.id)).issues.length) {
      preparationId = workflow.id;
      break;
    }
  }
  return { bot: botConfiguration(), forms: forms.results, preparationId };
}
