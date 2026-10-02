import { notArchived } from "@/features/archive/archive";
import "server-only";

import { and, asc, count, desc, eq, gte, like, lt, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { getDb } from "@/db";
import {
  recipientLinks,
  submissions,
  templates,
  templateVersions,
} from "@/db/schema";
import { toUtcIsoString } from "@/features/templates/date-time";
import {
  annotationFieldKey,
  annotationLabel,
  isSubmissionAnswer,
} from "@/features/templates/label-binding";
import type { SubmissionAnswer } from "@/features/templates/label-binding";
import type { SubmissionFilters } from "@/features/templates/submission-filters";
import { versionRole } from "@/features/templates/template-write";
import type { TemplateAnnotation } from "@/features/templates/template.types";

export async function queryOwnedSubmissions(
  ownerEmail: string,
  filters: SubmissionFilters,
  pagination:
    | number
    | { pageSize: number; offset: number; order?: "asc" | "desc" } = 200,
) {
  const conditions = submissionConditions(ownerEmail, filters);
  const pageSize =
    typeof pagination === "number" ? pagination : pagination.pageSize;
  const offset = typeof pagination === "number" ? 0 : pagination.offset;
  const order =
    typeof pagination === "number" ? "desc" : (pagination.order ?? "desc");
  const direction = order === "asc" ? asc : desc;
  const db = getDb();
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: submissions.id,
        templateId: templates.id,
        templateName: templates.name,
        templateVersionId: submissions.templateVersionId,
        versionNumber: templateVersions.versionNumber,
        annotationsJson: templateVersions.annotationsJson,
        rolesJson: templateVersions.rolesJson,
        roleId: recipientLinks.roleId,
        fallbackRoleName: recipientLinks.roleName,
        fallbackRoleColor: recipientLinks.roleColor,
        recipientName: submissions.recipientName,
        recipientEmail: submissions.recipientEmail,
        valuesJson: submissions.valuesJson,
        completedFileKey: submissions.completedFileKey,
        submittedAt: submissions.submittedAt,
      })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .innerJoin(
        templateVersions,
        eq(submissions.templateVersionId, templateVersions.id),
      )
      .innerJoin(
        recipientLinks,
        eq(submissions.recipientLinkId, recipientLinks.id),
      )
      .where(and(...conditions))
      .orderBy(direction(submissions.submittedAt), direction(submissions.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(submissions)
      .innerJoin(templates, eq(submissions.templateId, templates.id))
      .innerJoin(
        recipientLinks,
        eq(submissions.recipientLinkId, recipientLinks.id),
      )
      .where(and(...conditions)),
  ]);

  return {
    rows: rows.map((row) => {
      const role = versionRole(row.rolesJson, row.roleId, {
        name: row.fallbackRoleName,
        color: row.fallbackRoleColor,
      });
      return {
        ...row,
        submittedAt: toUtcIsoString(row.submittedAt) ?? row.submittedAt,
        roleName: role.name,
        roleColor: role.color,
        annotations: parseAnnotations(row.annotationsJson),
        answers: submissionAnswers(row.valuesJson, row.annotationsJson),
      };
    }),
    total: totals[0]?.total ?? 0,
  };
}

function submissionConditions(ownerEmail: string, filters: SubmissionFilters) {
  const conditions: SQL[] = [
    eq(templates.ownerEmail, ownerEmail),
    notArchived("submission", submissions.id),
  ];
  if (filters.templateId) {
    conditions.push(eq(submissions.templateId, filters.templateId));
  }
  if (filters.roleId)
    conditions.push(eq(recipientLinks.roleId, filters.roleId));
  if (filters.from) conditions.push(gte(submissions.submittedAt, filters.from));
  if (filters.to) conditions.push(lt(submissions.submittedAt, filters.to));
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const searchCondition = or(
      like(submissions.recipientName, pattern),
      like(submissions.recipientEmail, pattern),
      like(templates.name, pattern),
      like(recipientLinks.roleName, pattern),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  return conditions;
}

function parseAnnotations(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as TemplateAnnotation[]) : [];
  } catch {
    return [];
  }
}

function submissionAnswers(valuesJson: string, annotationsJson: string) {
  const annotations = parseAnnotations(annotationsJson);
  try {
    const parsed = JSON.parse(valuesJson) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isSubmissionAnswer);
    if (!parsed || typeof parsed !== "object") return [];
    const values = parsed as Record<string, unknown>;
    return annotations
      .filter((annotation) => Object.hasOwn(values, annotation.id))
      .map<SubmissionAnswer>((annotation) => ({
        fieldId: annotation.id,
        key: annotationFieldKey(annotation),
        label: annotationLabel(annotation),
        type: annotation.type,
        value: values[annotation.id],
      }));
  } catch {
    return [];
  }
}
