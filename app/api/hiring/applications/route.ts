import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import {
  createApplication,
  listApplications,
} from "@/features/hiring/hiring.server";
export async function GET(request: Request) {
  return hiringResponse(async () =>
    listApplications(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
  );
}
export async function POST(request: Request) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return {
      application: await createApplication(owner, await hiringBody(request)),
    };
  });
}
