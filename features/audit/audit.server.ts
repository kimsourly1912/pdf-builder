import "server-only";

import type { auditEvents } from "@/db/schema";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/u;

export type AuditAction =
  | "account.created"
  | "assignment.created"
  | "candidate.profile_verified"
  | "link.regenerated"
  | "link.revoked"
  | "resume.ai_analyzed"
  | "resume.deleted"
  | "resume.uploaded"
  | "submission.completed"
  | "template.archived"
  | "template.created"
  | "template.deleted"
  | "template.published"
  | "template.restored";

export type AuditActorType = "owner" | "recipient";
export type AuditTargetType =
  | "account"
  | "assignment"
  | "candidate"
  | "recipient_link"
  | "resume"
  | "submission"
  | "template";

type AuditEventOptions = {
  request: Request;
  ownerEmail: string;
  actorType: AuditActorType;
  actorId?: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  metadata?: Record<string, boolean | number | string | null>;
  createdAt?: string;
};

export function createAuditEvent(
  options: AuditEventOptions,
): typeof auditEvents.$inferInsert {
  const requestId = options.request.headers.get("X-Request-Id")?.trim();
  return {
    id: crypto.randomUUID(),
    ownerEmail: options.ownerEmail,
    actorType: options.actorType,
    actorId: options.actorId ?? null,
    action: options.action,
    targetType: options.targetType,
    targetId: options.targetId,
    requestId:
      requestId && REQUEST_ID_PATTERN.test(requestId) ? requestId : null,
    metadataJson: JSON.stringify(options.metadata ?? {}),
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export function parseAuditMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && !Array.isArray(parsed) && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
