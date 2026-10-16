import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import {
  createPipeline,
  hiringConfiguration,
} from "@/features/hiring/hiring.server";
export async function GET(request: Request) {
  return hiringResponse(async () =>
    hiringConfiguration(await requireRequestOwner(request)),
  );
}
export async function POST(request: Request) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return createPipeline(owner, await hiringBody(request));
  });
}
