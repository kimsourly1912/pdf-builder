import { formResponse, formResponses } from "@/features/forms/form.server";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return formResponse(async () =>
    formResponses(request, (await context.params).id),
  );
}
