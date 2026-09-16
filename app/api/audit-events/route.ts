import { and, asc, count, desc, eq, like, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import { parseAuditMetadata } from "@/features/audit/audit.server";
import {
  createPageMeta,
  parsePageQuery,
} from "@/features/pagination/pagination";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

const MAX_LIMIT = 200;

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const searchParams = new URL(request.url).searchParams;
    const pageQuery = parsePageQuery(searchParams, {
      sorts: ["createdAt"] as const,
      defaultSort: "createdAt",
      defaultPageSize: 25,
      maxPageSize: MAX_LIMIT,
    });
    const conditions: SQL[] = [eq(auditEvents.ownerEmail, ownerEmail)];
    const search = searchParams.get("search")?.trim().slice(0, 120);
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(or(
        like(auditEvents.action, pattern),
        like(auditEvents.targetType, pattern),
        like(auditEvents.targetId, pattern),
        like(auditEvents.actorId, pattern),
      )!);
    }
    const direction = pageQuery.order === "asc" ? asc : desc;
    const db = getDb();
    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(auditEvents)
        .where(and(...conditions))
        .orderBy(direction(auditEvents.createdAt), direction(auditEvents.id))
        .limit(pageQuery.pageSize)
        .offset(pageQuery.offset),
      db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(...conditions)),
    ]);

    return Response.json(
      {
        items: rows.map((event) => ({
          id: event.id,
          actorType: event.actorType,
          actorId: event.actorId,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          requestId: event.requestId,
          metadata: parseAuditMetadata(event.metadataJson),
          createdAt: event.createdAt,
        })),
        ...createPageMeta(totals[0]?.total ?? 0, pageQuery),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to list audit events", error);
    return jsonError("Activity could not be loaded.", 500);
  }
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}
