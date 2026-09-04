"use client";

import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import {
  EMPTY_CAMBODIA_ADDRESS,
  GAZETTEER_LEVELS,
  formatLocationLabel,
  parseCambodiaAddress,
} from "@/features/gazetteer/gazetteer";
import type {
  CambodiaAddressValue,
  GazetteerLanguage,
  GazetteerLevel,
  GazetteerLocation,
} from "@/features/gazetteer/gazetteer.types";

type CambodiaAddressFieldProps = {
  value: unknown;
  onChange?: (value: CambodiaAddressValue) => void;
  language?: GazetteerLanguage;
  deepestLevel?: GazetteerLevel;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

type GazetteerResponse = { data?: GazetteerLocation[]; error?: string };

const requestCache = new Map<string, Promise<GazetteerLocation[]>>();

const LEVEL_LABELS: Record<GazetteerLevel, { km: string; en: string }> = {
  province: { km: "រាជធានី / ខេត្ត", en: "Capital / Province" },
  district: { km: "ក្រុង / ស្រុក / ខណ្ឌ", en: "City / District / Khan" },
  commune: { km: "ឃុំ / សង្កាត់", en: "Commune / Sangkat" },
  village: { km: "ភូមិ", en: "Village" },
};

export function CambodiaAddressField(props: CambodiaAddressFieldProps) {
  const language = props.language ?? "bilingual";
  const deepestLevel = props.deepestLevel ?? "village";
  const value = parseCambodiaAddress(props.value);
  const visibleLevels = GAZETTEER_LEVELS.slice(
    0,
    GAZETTEER_LEVELS.indexOf(deepestLevel) + 1,
  );

  return (
    <fieldset
      className={`grid size-full min-h-0 grid-cols-2 gap-1 overflow-auto rounded-md border border-slate-300 bg-white/95 p-1 ${props.className ?? ""}`}
      style={props.style}
    >
      <legend className="sr-only">{props.label ?? "Cambodia address"}</legend>
      {visibleLevels.map((level) => (
        <AddressLevelSelect
          key={level}
          level={level}
          value={value}
          language={language}
          disabled={props.disabled}
          required={props.required}
          onChange={props.onChange}
        />
      ))}
    </fieldset>
  );
}

function AddressLevelSelect(props: {
  level: GazetteerLevel;
  value: CambodiaAddressValue;
  language: GazetteerLanguage;
  disabled?: boolean;
  required?: boolean;
  onChange?: (value: CambodiaAddressValue) => void;
}) {
  const parentCode = getParentCode(props.level, props.value);
  const canLoad = props.level === "province" || Boolean(parentCode);
  const requestKey = `${props.level}:${parentCode ?? "root"}`;
  const [attempt, setAttempt] = useState(0);
  const effectKey = `${requestKey}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    options: GazetteerLocation[];
    error: string;
  }>({ key: "", options: [], error: "" });
  const loading = canLoad && !props.disabled && result.key !== effectKey;
  const options = result.key === effectKey ? result.options : [];
  const error = result.key === effectKey ? result.error : "";
  const selectedCode = props.value[props.level]?.code ?? "";
  const label = useMemo(
    () => formatLevelLabel(props.level, props.language),
    [props.language, props.level],
  );

  useEffect(() => {
    let active = true;
    if (!canLoad || props.disabled) return;
    void loadLocations(props.level, parentCode, attempt > 0)
      .then((data) => {
        if (active) setResult({ key: effectKey, options: data, error: "" });
      })
      .catch((cause) => {
        if (active) {
          setResult({
            key: effectKey,
            options: [],
            error:
              cause instanceof Error
                ? cause.message
                : "Locations could not be loaded.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, canLoad, effectKey, parentCode, props.disabled, props.level]);

  if (props.disabled) {
    return (
      <div className="flex min-h-7 items-center truncate rounded border border-slate-200 bg-slate-50 px-1.5 text-[10px] text-slate-500">
        {props.value[props.level]
          ? formatLocationLabel(props.value[props.level]!, props.language)
          : label}
      </div>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        title={error}
        onClick={() => {
          requestCache.delete(requestKey);
          setAttempt((current) => current + 1);
        }}
        className="flex min-h-8 items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 text-left text-[10px] text-rose-700"
      >
        <AlertCircle className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Retry {label}</span>
        <RefreshCw className="size-3 shrink-0" />
      </button>
    );
  }

  return (
    <label className="relative min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={selectedCode}
        disabled={!canLoad || loading}
        required={props.required}
        onChange={(event) => {
          const selected = options.find((option) => option.code === event.target.value) ?? null;
          props.onChange?.(replaceLevel(props.value, props.level, selected));
        }}
        className="size-full min-h-8 w-full truncate rounded border border-slate-300 bg-white px-1.5 pr-5 text-[10px] text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
      >
        <option value="">
          {loading ? `Loading ${label}…` : `Select ${label}`}
        </option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {formatLocationLabel(option, props.language)}
          </option>
        ))}
      </select>
      {loading && (
        <LoaderCircle className="pointer-events-none absolute right-1 top-1/2 size-3 -translate-y-1/2 animate-spin text-slate-400" />
      )}
    </label>
  );
}

async function loadLocations(
  level: GazetteerLevel,
  parentCode: string | null,
  refresh = false,
) {
  const key = `${level}:${parentCode ?? "root"}`;
  if (refresh) requestCache.delete(key);
  const cached = requestCache.get(key);
  if (cached) return cached;

  const search = new URLSearchParams({ level });
  if (parentCode) search.set("parent", parentCode);
  const request = fetch(`/api/gazetteer?${search.toString()}`, {
    headers: { accept: "application/json" },
  }).then(async (response) => {
    const result = (await response.json().catch(() => ({}))) as GazetteerResponse;
    if (!response.ok) {
      throw new Error(result.error || "Locations could not be loaded.");
    }
    return Array.isArray(result.data) ? result.data : [];
  });

  requestCache.set(key, request);
  request.catch(() => requestCache.delete(key));
  return request;
}

function getParentCode(
  level: GazetteerLevel,
  value: CambodiaAddressValue,
) {
  if (level === "district") return value.province?.code ?? null;
  if (level === "commune") return value.district?.code ?? null;
  if (level === "village") return value.commune?.code ?? null;
  return null;
}

function replaceLevel(
  value: CambodiaAddressValue,
  level: GazetteerLevel,
  location: GazetteerLocation | null,
) {
  const next = { ...EMPTY_CAMBODIA_ADDRESS, ...value, [level]: location };
  const levelIndex = GAZETTEER_LEVELS.indexOf(level);
  for (const descendant of GAZETTEER_LEVELS.slice(levelIndex + 1)) {
    next[descendant] = null;
  }
  return next;
}

function formatLevelLabel(
  level: GazetteerLevel,
  language: GazetteerLanguage,
) {
  const labels = LEVEL_LABELS[level];
  if (language === "km") return labels.km;
  if (language === "en") return labels.en;
  return `${labels.km} / ${labels.en}`;
}
