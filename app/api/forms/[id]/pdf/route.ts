import {
  formResponse,
  formPdf,
  uploadFormPdf,
} from "@/features/forms/form.server";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return formResponse(async () => formPdf(request, (await context.params).id));
}
export function PUT(request: Request, context: Context) {
  return formResponse(async () =>
    uploadFormPdf(request, (await context.params).id),
  );
}
