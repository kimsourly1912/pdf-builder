export async function workflowApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? (response.status === 401 ? "Sign in again to continue." : "The workflow request failed."));
  return payload;
}
export function errorText(error: unknown): string { return error instanceof Error ? error.message : "The request failed."; }
export function runDate(value: string): string { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
