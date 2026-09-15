const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/u;
const FILL_API_PATH_PATTERN = /^\/api\/fill\/[^/]+(?=\/|$)/u;
const FILL_PAGE_PATH_PATTERN = /^\/fill\/[^/]+(?=\/|$)/u;

export function resolveRequestId(headers: Headers): string {
  const supplied = headers.get("X-Request-Id")?.trim();
  return supplied && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function requestWithId(request: Request, requestId: string): Request {
  const headers = new Headers(request.headers);
  headers.set("X-Request-Id", requestId);
  return new Request(request, { headers });
}

export function responseWithRequestId(
  response: Response,
  requestId: string,
  durationMs?: number,
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  if (durationMs !== undefined && Number.isFinite(durationMs)) {
    headers.set("Server-Timing", `app;dur=${Math.max(0, durationMs).toFixed(1)}`);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function requestPathForLog(url: string): string {
  try {
    return new URL(url).pathname
      .replace(FILL_API_PATH_PATTERN, "/api/fill/:token")
      .replace(FILL_PAGE_PATH_PATTERN, "/fill/:token");
  } catch {
    return "/invalid-url";
  }
}

export function requestDurationMs(startedAt: number): number {
  return Math.round(Math.max(0, performance.now() - startedAt) * 10) / 10;
}
