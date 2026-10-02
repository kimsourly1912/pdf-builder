"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useUrlFilters<T extends Record<string, string>>(
  defaults: T,
  validate: (key: keyof T, value: string) => boolean,
  storageKey: string,
) {
  const [filters, setState] = useState<T>(defaults),
    [ready, setReady] = useState(false);
  const latest = useRef<T>(defaults);
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search),
        next = { ...defaults };
      let saved: Record<string, string> = {};
      if (!Object.keys(defaults).some((key) => params.has(key))) {
        try {
          const value: unknown = JSON.parse(
            sessionStorage.getItem(storageKey) ?? "{}",
          );
          if (value && typeof value === "object" && !Array.isArray(value))
            saved = value as Record<string, string>;
        } catch {}
      }
      for (const key of Object.keys(defaults) as (keyof T)[]) {
        const value = params.get(String(key)) ?? saved[String(key)] ?? null;
        if (typeof value === "string" && validate(key, value))
          next[key] = value as T[keyof T];
      }
      const url = new URL(location.href);
      for (const key of Object.keys(defaults) as (keyof T)[]) {
        if (next[key] === defaults[key]) url.searchParams.delete(String(key));
        else url.searchParams.set(String(key), next[key]);
      }
      history.replaceState(history.state, "", url);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      latest.current = next;
      setState(next);
      setReady(true);
    };
    const timer = setTimeout(read, 0);
    window.addEventListener("popstate", read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", read);
    };
  }, [defaults, validate, storageKey]);
  const setFilters = useCallback(
    (patch: Partial<T>) => {
      const next = { ...latest.current, ...patch },
        url = new URL(location.href);
      for (const key of Object.keys(defaults) as (keyof T)[]) {
        if (next[key] === defaults[key]) url.searchParams.delete(String(key));
        else url.searchParams.set(String(key), next[key]);
      }
      history.replaceState(history.state, "", url);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      latest.current = next;
      setState(next);
    },
    [defaults, storageKey],
  );
  return { filters, setFilters, ready };
}
