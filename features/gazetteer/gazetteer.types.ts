export type GazetteerLanguage = "km" | "en" | "bilingual";

export type GazetteerLevel =
  | "province"
  | "district"
  | "commune"
  | "village";

export type GazetteerLocation = {
  code: string;
  nameKm: string;
  nameEn: string;
  type: string;
  typeKm: string | null;
  typeEn: string | null;
  parentCode: string | null;
};

export type CambodiaAddressValue = {
  province: GazetteerLocation | null;
  district: GazetteerLocation | null;
  commune: GazetteerLocation | null;
  village: GazetteerLocation | null;
};
