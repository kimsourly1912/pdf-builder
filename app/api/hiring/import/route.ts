import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import { legacyPreview, importLegacy } from "@/features/hiring/hiring.server";
export async function GET(request: Request) {
  return hiringResponse(async () =>
    legacyPreview(await requireRequestOwner(request)),
  );
}
export async function POST(request: Request) {
  return hiringResponse(async () => {
    const owner = await requireRequestOwner(request);
    return importLegacy(owner, await hiringBody(request));
  });
}
