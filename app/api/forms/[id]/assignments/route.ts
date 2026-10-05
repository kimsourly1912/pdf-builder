import { formResponse, formAssignedPeople } from "@/features/forms/form.server";
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return formResponse(async () =>
    formAssignedPeople(request, (await context.params).id),
  );
}
