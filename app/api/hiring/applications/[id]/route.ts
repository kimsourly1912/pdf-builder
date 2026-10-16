import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import {
  applicationDetail,
  mutateApplication,
} from "@/features/hiring/hiring.server";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, c: Context) {
  return hiringResponse(async () =>
    applicationDetail(await requireRequestOwner(request), (await c.params).id),
  );
}
export async function PATCH(request: Request, c: Context) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return {
      application: await mutateApplication(
        owner,
        (await c.params).id,
        await hiringBody(request),
      ),
    };
  });
}
