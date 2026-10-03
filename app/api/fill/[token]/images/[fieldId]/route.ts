import { draftImage } from "@/features/forms/submission.server";
import { formResponse } from "@/features/forms/form.server";
export function GET(request: Request, context: { params: Promise<{ token: string; fieldId: string }> }) { return formResponse(async () => { const params = await context.params; return draftImage(request, params.token, params.fieldId); }); }
