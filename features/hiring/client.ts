"use client";
import { useCallback, useEffect, useState } from "react";
import { workflowApi, errorText } from "@/features/workflows/client";
import type { Pipeline, PipelineVersion, HiringJob } from "./hiring";
export type HiringConfiguration = {
  pipelines: Pipeline[];
  versions: PipelineVersion[];
  jobs: HiringJob[];
  pipelineReferences?: Record<string, string>;
};
export function useHiringConfiguration() {
  const [config, setConfig] = useState<HiringConfiguration | null>(null),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const data = await workflowApi<HiringConfiguration>(
        "/api/hiring/pipelines",
      );
      setConfig(data);
      setError("");
      return data;
    } catch (e) {
      setError(errorText(e));
      return null;
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);
  return { config, setConfig, error, reload };
}
export const stageTone = {
  neutral: "border-t-border",
  amber: "border-t-amber-500",
  blue: "border-t-blue-500",
  green: "border-t-emerald-500",
  red: "border-t-red-500",
};
