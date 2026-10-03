import { formResponse, previewPdf } from "@/features/forms/form.server";
type Context = { params: Promise<{ id: string }> };
export function POST(request: Request, context: Context) {
  return formResponse(async () =>
    previewPdf(request, (await context.params).id),
  );
}
