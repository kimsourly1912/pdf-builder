const ASSIGNED_FILL_PREFIX = "assigned_";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const COMPLETED_PDF_GENERATOR = "pdf-studio-server-v1";

export function assignedFillIdentifier(assignmentId: string): string {
  if (!UUID_PATTERN.test(assignmentId)) {
    throw new Error("A valid assignment id is required.");
  }
  return `${ASSIGNED_FILL_PREFIX}${assignmentId}`;
}

export function parseAssignedFillIdentifier(identifier: string): string | null {
  if (!identifier.startsWith(ASSIGNED_FILL_PREFIX)) return null;
  const assignmentId = identifier.slice(ASSIGNED_FILL_PREFIX.length);
  return UUID_PATTERN.test(assignmentId) ? assignmentId : null;
}

export async function sha256Hex(
  value: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
