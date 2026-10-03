import { saveResponseDraft } from "@/features/forms/submission.server";
import { formResponse } from "@/features/forms/form.server";
export function PUT(request: Request, context: { params: Promise<{ token: string }> }) { return formResponse(async () => saveResponseDraft(request, (await context.params).token)); }
