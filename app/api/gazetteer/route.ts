const GAZETTEER_BASE_URL = "https://cambo-gazetteer.manethpak.dev/api/v1";

const LEVEL_CONFIG = {
  province: { path: "provinces", parentParameter: null, parentPattern: /^$/u },
  district: { path: "districts", parentParameter: "province", parentPattern: /^\d{2}$/u },
  commune: { path: "communes", parentParameter: "district", parentPattern: /^\d{4}$/u },
  village: { path: "villages", parentParameter: "commune", parentPattern: /^\d{6}$/u },
} as const;

type GazetteerLevel = keyof typeof LEVEL_CONFIG;

type UpstreamLocation = {
  code?: unknown;
  name_km?: unknown;
  name_en?: unknown;
  type?: unknown;
  type_km?: unknown;
  type_en?: unknown;
  parentCode?: unknown;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const level = requestUrl.searchParams.get("level");
  const parent = requestUrl.searchParams.get("parent") ?? "";

  if (!isLevel(level)) {
    return Response.json(
      { error: "Choose province, district, commune, or village." },
      { status: 400 },
    );
  }

  const config = LEVEL_CONFIG[level];
  if (config.parentParameter && !config.parentPattern.test(parent)) {
    return Response.json(
      { error: `A valid parent code is required for ${level}.` },
      { status: 400 },
    );
  }

  const upstreamUrl = new URL(`${GAZETTEER_BASE_URL}/${config.path}`);
  if (config.parentParameter) {
    upstreamUrl.searchParams.set(config.parentParameter, parent);
    upstreamUrl.searchParams.set("page", "1");
    upstreamUrl.searchParams.set("limit", "100");
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) {
      console.error("Gazetteer upstream failure", {
        level,
        status: upstream.status,
      });
      return Response.json(
        { error: "Cambodia locations are temporarily unavailable." },
        { status: 502 },
      );
    }

    const payload = (await upstream.json()) as { data?: UpstreamLocation[] };
    const data = (payload.data ?? []).flatMap((location) => {
      if (
        typeof location.code !== "string" ||
        typeof location.name_km !== "string" ||
        typeof location.name_en !== "string" ||
        typeof location.type !== "string"
      ) {
        return [];
      }

      return [{
        code: location.code,
        nameKm: location.name_km,
        nameEn: location.name_en,
        type: location.type,
        typeKm: typeof location.type_km === "string" ? location.type_km : null,
        typeEn: typeof location.type_en === "string" ? location.type_en : null,
        parentCode:
          typeof location.parentCode === "string" ? location.parentCode : null,
      }];
    });

    return Response.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, max-age=14400, stale-while-revalidate=3600",
        },
      },
    );
  } catch (error) {
    console.error("Gazetteer request failed", error);
    return Response.json(
      { error: "Cambodia locations are temporarily unavailable." },
      { status: 502 },
    );
  }
}

function isLevel(value: string | null): value is GazetteerLevel {
  return value !== null && Object.hasOwn(LEVEL_CONFIG, value);
}
