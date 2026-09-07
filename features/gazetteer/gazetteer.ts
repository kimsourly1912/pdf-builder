import type {
  CambodiaAddressValue,
  GazetteerLanguage,
  GazetteerLevel,
  GazetteerLocation,
} from "@/features/gazetteer/gazetteer.types";

export const EMPTY_CAMBODIA_ADDRESS: CambodiaAddressValue = {
  province: null,
  district: null,
  commune: null,
  village: null,
};

export const GAZETTEER_LEVELS: GazetteerLevel[] = [
  "province",
  "district",
  "commune",
  "village",
];

export function isGazetteerLevel(value: unknown): value is GazetteerLevel {
  return typeof value === "string" && GAZETTEER_LEVELS.includes(value as GazetteerLevel);
}

export function parseCambodiaAddress(value: unknown): CambodiaAddressValue {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return { ...EMPTY_CAMBODIA_ADDRESS };
  }

  const candidate = value as Record<string, unknown>;
  return {
    province: parseLocation(candidate.province),
    district: parseLocation(candidate.district),
    commune: parseLocation(candidate.commune),
    village: parseLocation(candidate.village),
  };
}

export function isAddressComplete(
  value: unknown,
  requiredLevel: GazetteerLevel = "village",
) {
  const address = parseCambodiaAddress(value);
  const requiredIndex = GAZETTEER_LEVELS.indexOf(requiredLevel);

  return GAZETTEER_LEVELS.slice(0, requiredIndex + 1).every(
    (level) => Boolean(address[level]?.code),
  );
}

export function truncateCambodiaAddress(
  value: unknown,
  deepestLevel: GazetteerLevel,
) {
  const address = parseCambodiaAddress(value);
  const deepestIndex = GAZETTEER_LEVELS.indexOf(deepestLevel);
  for (const level of GAZETTEER_LEVELS.slice(deepestIndex + 1)) {
    address[level] = null;
  }
  return address;
}

export function formatLocationLabel(
  location: GazetteerLocation,
  language: GazetteerLanguage,
) {
  if (language === "km") return location.nameKm;
  if (language === "en") return location.nameEn;
  return `${location.nameKm} / ${location.nameEn}`;
}

export function formatCambodiaAddress(
  value: unknown,
  language: GazetteerLanguage = "bilingual",
  separator = ", ",
) {
  const address = parseCambodiaAddress(value);
  return GAZETTEER_LEVELS
    .map((level) => address[level])
    .filter((location): location is GazetteerLocation => Boolean(location))
    .map((location) => formatLocationLabel(location, language))
    .join(separator);
}

function parseLocation(value: unknown): GazetteerLocation | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.code !== "string" ||
    typeof candidate.nameKm !== "string" ||
    typeof candidate.nameEn !== "string" ||
    typeof candidate.type !== "string"
  ) {
    return null;
  }

  return {
    code: candidate.code,
    nameKm: candidate.nameKm,
    nameEn: candidate.nameEn,
    type: candidate.type,
    typeKm: typeof candidate.typeKm === "string" ? candidate.typeKm : null,
    typeEn: typeof candidate.typeEn === "string" ? candidate.typeEn : null,
    parentCode:
      typeof candidate.parentCode === "string" ? candidate.parentCode : null,
  };
}
