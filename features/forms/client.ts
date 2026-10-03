export async function formApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : response.status === 401 ? "Your session expired. Sign in again; keep this page open to preserve your work." : "The request could not be completed. Try again.",
    );
  return body as T;
}
