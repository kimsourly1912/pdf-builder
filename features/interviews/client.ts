export class InterviewApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function interviewApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const payload = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok || !payload)
    throw new InterviewApiError(
      payload?.error ??
        (response.status === 401
          ? "Sign in again to access interview progress."
          : response.status === 403
            ? "You do not have permission to manage this workspace."
            : "Interview progress could not be loaded or saved. Try again."),
      response.status,
    );
  return payload;
}
