import { POST as assignAccount } from "@/app/api/accounts/[id]/assignments/route";
import {
  formResponse,
  formBody,
  ownedForm,
  findAssignmentAccount,
} from "@/features/forms/form.server";
import { FORM_ASSIGNMENT_ROLE } from "@/features/forms/form";
import {
  requireRequestOwner,
  jsonError,
} from "@/features/templates/template.server";
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return formResponse(async () => {
    const owner = await requireRequestOwner(request),
      id = (await context.params).id;
    const form = await ownedForm(owner, id),
      body = await formBody(request);
    if (!form.currentVersionId)
      throw jsonError("Publish this form before assigning it.", 422);
    const account = await findAssignmentAccount(
      owner,
      String(body.email ?? ""),
    );
    return assignAccount(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          templateId: id,
          roleId: FORM_ASSIGNMENT_ROLE.id,
        }),
      }),
      { params: Promise.resolve({ id: account.id }) },
    );
  });
}
