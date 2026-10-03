import {
  formResponse,
  listForms,
  createForm,
} from "@/features/forms/form.server";
export function GET(request: Request) {
  return formResponse(() => listForms(request));
}
export function POST(request: Request) {
  return formResponse(() => createForm(request));
}
