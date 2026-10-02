import { isResponse, jsonError } from "@/features/templates/template.server";
export async function workflowResponse(action: () => Promise<unknown>) {
  try { return Response.json(await action(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { if (isResponse(error)) return error; if (error instanceof Error && /WORKFLOW_REVIEW_CHANGED/u.test(error.message)) return jsonError("This resume changed during review. Reload before saving.", 409); console.error("Workflow request failed", { errorName: error instanceof Error ? error.name : "Unknown" }); return jsonError("The workflow request could not be completed.", 500); }
}
export async function workflowBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 100000) throw jsonError("This workflow request is too large.", 413);
  try { const body: unknown = JSON.parse(text); if (!body || Array.isArray(body) || typeof body !== "object") throw new Error(); return body as Record<string, unknown>; }
  catch { throw jsonError("Enter valid workflow data.", 400); }
}
