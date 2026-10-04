import {
  requireRequestOwner,
  jsonError,
} from "@/features/templates/template.server";
import {
  workflowBody,
  workflowResponse,
} from "@/features/workflows/api.server";
import { resetChoice } from "@/features/test-data/reset";
import {
  executeTestDataReset,
  previewTestDataReset,
  testDataResetEnabled,
} from "@/features/test-data/reset.server";

export async function GET(request: Request) {
  return workflowResponse(async () => {
    await requireRequestOwner(request);
    return { enabled: testDataResetEnabled() };
  });
}
export async function POST(request: Request) {
  return workflowResponse(async () => {
    const owner = await requireRequestOwner(request);
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin)
      throw jsonError(
        "Open Test data reset in this app before continuing.",
        403,
      );
    const body = await workflowBody(request),
      choice = resetChoice(body);
    if (!choice) throw jsonError("Choose a valid reset option.", 422);
    if (body.action === "preview")
      return { preview: await previewTestDataReset(owner, choice) };

    if (
      body.action === "reset" &&
      typeof body.revision === "string" &&
      typeof body.confirmation === "string"
    )
      return {
        result: await executeTestDataReset(
          owner,
          choice,
          body.revision,
          body.confirmation,
        ),
      };
    throw jsonError("Preview the reset before confirming deletion.", 422);
  });
}
