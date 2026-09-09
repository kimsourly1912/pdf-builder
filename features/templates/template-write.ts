import type { RecipientRole } from "@/features/templates/template.types";

export function parseTemplateJson<T>(value: FormDataEntryValue | null): T | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function validRecipientRoles(
  value: RecipientRole[] | null,
): value is RecipientRole[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    return false;
  }
  const ids = new Set<string>();
  for (const role of value) {
    if (
      !role ||
      typeof role.id !== "string" ||
      typeof role.name !== "string" ||
      typeof role.color !== "string" ||
      !/^[A-Za-z0-9_-]{1,120}$/u.test(role.id) ||
      !role.name.trim() ||
      role.id.length > 120 ||
      role.name.length > 80 ||
      !/^#[0-9a-f]{6}$/iu.test(role.color) ||
      ids.has(role.id)
    ) {
      return false;
    }
    ids.add(role.id);
  }
  return true;
}

export function parseVersionRoles(value: string): RecipientRole[] {
  try {
    const parsed = JSON.parse(value) as RecipientRole[];
    return validRecipientRoles(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function versionRole(
  rolesJson: string,
  roleId: string,
  fallback: { name: string; color: string },
) {
  const role = parseVersionRoles(rolesJson).find((item) => item.id === roleId);
  return role ?? { id: roleId, name: fallback.name, color: fallback.color };
}
