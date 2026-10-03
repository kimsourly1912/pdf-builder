import { formResponse, getForm, saveForm } from "@/features/forms/form.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return formResponse(async () => getForm(request, (await context.params).id));
}
export async function PATCH(request: Request, context: Context) {
  return formResponse(async () => saveForm(request, (await context.params).id));
}
