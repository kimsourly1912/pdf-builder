import { isResponse, jsonError } from "@/features/templates/template.server";
export async function interviewResponse(action: () => Promise<unknown>) {
  try {
    return Response.json(await action(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Interview request failed", {
      errorName: error instanceof Error ? error.name : "Unknown",
    });
    return jsonError(
      "Interview progress could not be loaded or saved. Try again; your input is retained.",
      500,
    );
  }
}
export function sameSiteInterview(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw jsonError("Use the same site to update interview progress.", 403);
}
