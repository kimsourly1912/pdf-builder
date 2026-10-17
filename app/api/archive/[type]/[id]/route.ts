import { requireRequestOwner } from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { fail } from "@/features/workflows/workflow.server";
import { isArchiveType } from "@/features/archive/archive";
import {
  ownedArchiveEntity,
  archiveEntity,
  archivedGroup,
  deletionBlocker,
  deleteArchivedEntity,
  restoreEntity,
  previewDeletion,
  deleteEntity,
} from "@/features/archive/archive.server";
type Context = { params: Promise<{ type: string; id: string }> };
export async function GET(request: Request, context: Context) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request),
      { type, id } = await context.params;
    if (!isArchiveType(type)) fail("Unknown archive type.", 404);
    if (new URL(request.url).searchParams.get("preview") === "delete")
      return previewDeletion(owner, type, id);
    const group = await archivedGroup(owner, type, id);
    const record = await ownedArchiveEntity(owner, type, id);
    const fields = [
      "label",
      "email",
      "name",
      "status",
      "verification_status",
      "created_at",
      "updated_at",
      "page_count",
      "model",
      "total_tokens",
      "error_message",
      "workflow_name",
    ];
    const details = Object.fromEntries(
      fields.filter((k) => record?.[k] != null).map((k) => [k, record![k]]),
    );
    return {
      ...group,
      details,
      blockers: await Promise.all(
        group.members.map(async (r) => ({
          type: r.entity_type,
          reason: await deletionBlocker(owner, r.entity_type, r.entity_id),
        })),
      ),
    };
  });
}
export async function POST(request: Request, context: Context) {
  return workflowResponse(async () => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      fail("Use the same site to archive or delete records.", 403);
    const owner = await requireRequestOwner(request),
      { type, id } = await context.params,
      body = await workflowBody(request);
    if (!isArchiveType(type)) fail("Unknown archive type.", 404);
    if (body.action === "archive") return archiveEntity(owner, type, id);
    if (body.action === "delete_permanently" && body.confirm === true && typeof body.expectedState === "string")
      return deleteEntity(owner, type, id, body.expectedState);
    if (typeof body.expectedArchivedAt !== "string")
      fail("Refresh this archive record first.", 409);
    if (body.action === "restore")
      return restoreEntity(owner, type, id, body.expectedArchivedAt);
    if (body.action === "delete" && body.confirm === true)
      return deleteArchivedEntity(owner, type, id, body.expectedArchivedAt);
    fail(
      "Choose archive, restore, or explicitly confirm permanent deletion.",
      422,
    );
  });
}
