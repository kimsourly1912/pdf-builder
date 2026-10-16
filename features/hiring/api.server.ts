import { isResponse, jsonError } from "@/features/templates/template.server";
import { workflowBody } from "@/features/workflows/api.server";
export async function hiringBody(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw jsonError("Use the same site to update hiring records.", 403);
  return workflowBody(request);
}
export async function hiringResponse(action: () => Promise<unknown>) {
  try {
    return Response.json(await action(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Hiring request failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return jsonError(
      "Hiring records could not be loaded or saved. Try again; your input is retained.",
      500,
    );
  }
}
