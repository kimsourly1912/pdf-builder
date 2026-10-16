import { requireRequestOwner } from "@/features/templates/template.server";
import { hiringBody, hiringResponse } from "@/features/hiring/api.server";
import { adoptLegacy, legacyInventory } from "@/features/hiring/legacy.server";
export async function GET(request: Request) {
  return hiringResponse(async () =>
    legacyInventory(
      await requireRequestOwner(request),
      new URL(request.url).searchParams,
    ),
  );
}
export async function POST(request: Request) {
  return hiringResponse(async () =>
    adoptLegacy(await requireRequestOwner(request), await hiringBody(request)),
  );
}
