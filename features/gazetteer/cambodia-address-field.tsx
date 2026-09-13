"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  EMPTY_CAMBODIA_ADDRESS,
  GAZETTEER_LEVELS,
  formatCambodiaAddress,
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
  iconSize?: number;
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
  const visibleLevels = useMemo(
    () =>
      GAZETTEER_LEVELS.slice(
        0,
        GAZETTEER_LEVELS.indexOf(deepestLevel) + 1,
      ),
    [deepestLevel],
  );
  const [open, setOpen] = useState(false);
  const [activeLevel, setActiveLevel] = useState<GazetteerLevel>("province");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    options: GazetteerLocation[];
    error: string;
  }>({ key: "", options: [], error: "" });

  const currentLevel = visibleLevels.includes(activeLevel)
    ? activeLevel
    : visibleLevels[visibleLevels.length - 1] ?? "province";
  const parentCode = getParentCode(currentLevel, value);
  const canLoad = currentLevel === "province" || Boolean(parentCode);
  const requestKey = `${currentLevel}:${parentCode ?? "root"}`;
  const effectKey = `${requestKey}:${attempt}`;
  const loading = open && canLoad && result.key !== effectKey;
  const options = result.key === effectKey ? result.options : [];
  const error = result.key === effectKey ? result.error : "";
  const selectedCode = value[currentLevel]?.code ?? "";
  const displayValue = formatCambodiaAddress(value, language);
  const activeLabel = formatLevelLabel(currentLevel, language);
  const hasValue = visibleLevels.some((level) => Boolean(value[level]));

  useEffect(() => {
    let active = true;
    if (!open || !canLoad || props.disabled) return;

    void loadLocations(currentLevel, parentCode, attempt > 0)
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
  }, [attempt, canLoad, currentLevel, effectKey, open, parentCode, props.disabled]);

  const openAtCurrentStep = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setActiveLevel(
        visibleLevels.find((level) => !value[level]) ??
          visibleLevels[visibleLevels.length - 1] ??
          "province",
      );
    }
  };

  const selectLocation = (location: GazetteerLocation) => {
    const nextValue = replaceLevel(value, currentLevel, location);
    props.onChange?.(nextValue);
    const activeIndex = visibleLevels.indexOf(currentLevel);
    const nextLevel = visibleLevels[activeIndex + 1];
    if (nextLevel) {
      setAttempt(0);
      setActiveLevel(nextLevel);
    } else {
      setOpen(false);
    }
  };

  const triggerStyle: CSSProperties = {
    color: props.style?.color,
    borderColor: props.style?.borderColor,
    fontSize: props.style?.fontSize,
  };
  const triggerIconStyle: CSSProperties | undefined = props.iconSize
    ? { width: props.iconSize, height: props.iconSize }
    : undefined;

  if (props.disabled) {
    return (
      <div
        className={`flex size-full min-w-0 items-center rounded-md border border-input bg-white px-2 text-foreground ${props.className ?? ""}`}
        style={{ ...props.style, ...triggerStyle }}
        title={displayValue || props.label || "Cambodia address"}
      >
        <span className={`min-w-0 flex-1 ${displayValue ? "truncate" : "text-muted-foreground"}`}>
          {displayValue || props.label || "Cambodia address"}
        </span>
        <ChevronDown
          className="ml-1 shrink-0 text-muted-foreground"
          style={triggerIconStyle}
          strokeWidth={2.25}
        />
      </div>
    );
  }

  return (
    <div className={`size-full min-w-0 ${props.className ?? ""}`} style={props.style}>
      <Popover open={open} onOpenChange={openAtCurrentStep}>
        <PopoverTrigger asChild>
          <Button variant="ghost"
            type="button"
            aria-label={props.label ?? "Cambodia address"}
            aria-expanded={open}
            data-required={props.required || undefined}
            onPointerDown={(event) => event.stopPropagation()}
            className="size-full min-w-0 justify-start rounded-md border-input bg-card px-2 text-left text-foreground shadow-xs focus-visible:border-ring focus-visible:ring-ring/50"
            style={triggerStyle}
            title={displayValue || props.label || "Select Cambodia address"}
          >
            <span className={`min-w-0 flex-1 truncate ${displayValue ? "" : "text-muted-foreground"}`}>
              {displayValue || props.label || "Select Cambodia address"}
            </span>
            <ChevronDown
              className="ml-1 shrink-0 text-muted-foreground"
              style={triggerIconStyle}
              strokeWidth={2.25}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onPointerDown={(event) => event.stopPropagation()}
          className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0 text-sm"
        >
          <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">
                {props.label || "Cambodia address"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Step {visibleLevels.indexOf(currentLevel) + 1} of {visibleLevels.length}: {activeLabel}
              </p>
            </div>
            {hasValue && (
              <Button variant="ghost"
                type="button"
                onClick={() => {
                  props.onChange?.({ ...EMPTY_CAMBODIA_ADDRESS });
                  setAttempt(0);
                  setActiveLevel("province");
                }}
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" /> Clear
              </Button>
            )}
          </div>

          <div className="flex min-h-9 items-center gap-0.5 overflow-x-auto border-b bg-muted/40 px-2 py-1.5">
            {visibleLevels.map((level, index) => {
              const location = value[level];
              const isActive = level === currentLevel;
              return (
                <div key={level} className="flex shrink-0 items-center">
                  {index > 0 && <ChevronRight className="size-3 text-muted-foreground/50" />}
                  <Button variant="ghost"
                    type="button"
                    disabled={!location && !isActive}
                    onClick={() => {
                      setAttempt(0);
                      setActiveLevel(level);
                    }}
                    className={`max-w-32 truncate rounded px-1.5 py-1 text-xs ${
                      isActive
                        ? "bg-primary/10 font-semibold text-primary"
                        : location
                          ? "text-muted-foreground hover:bg-accent"
                          : "text-muted-foreground"
                    } disabled:cursor-not-allowed`}
                    title={location ? formatLocationLabel(location, language) : formatLevelLabel(level, language)}
                  >
                    {location
                      ? formatLocationLabel(location, language)
                      : formatLevelLabel(level, language)}
                  </Button>
                </div>
              );
            })}
          </div>

          <Command key={effectKey}>
            <CommandInput placeholder={`Search ${activeLabel}…`} autoFocus />
            <CommandList className="max-h-64">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" /> Loading {activeLabel}…
                </div>
              ) : error ? (
                <div className="p-3">
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => {
                        requestCache.delete(requestKey);
                        setAttempt((current) => current + 1);
                      }}
                      className="mt-2 flex items-center gap-1 font-semibold hover:underline"
                    >
                      <RefreshCw className="size-3" /> Retry
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <CommandEmpty>No matching locations found.</CommandEmpty>
                  <CommandGroup heading={activeLabel}>
                    {options.map((option) => (
                      <CommandItem
                        key={option.code}
                        value={`${option.nameKm} ${option.nameEn} ${option.code}`}
                        onSelect={() => selectLocation(option)}
                      >
                        <Check
                          className={`size-4 ${selectedCode === option.code ? "opacity-100" : "opacity-0"}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">
                            {formatLocationLabel(option, language)}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">{option.code}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground/50" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
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

function getParentCode(level: GazetteerLevel, value: CambodiaAddressValue) {
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
