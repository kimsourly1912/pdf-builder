const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/u;

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
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
