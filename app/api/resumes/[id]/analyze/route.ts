import { analyzeResumeForOwner } from "@/features/resumes/analyze-resume.server";
import { isResponse, jsonError, requireRequestOwner } from "@/features/templates/template.server";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const { id } = await context.params;
    return analyzeResumeForOwner(request, ownerEmail, id);
  } catch (error) {
    if (isResponse(error)) return error;
    return jsonError("The resume could not be analyzed.", 500);
  }
}
