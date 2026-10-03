"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/patterns/app-shell";
import { PageHeader } from "@/components/patterns/page-header";
import { ArchiveButton } from "./archive-button";
import { workflowApi, errorText, runDate } from "@/features/workflows/client";
type Run = { id: string; fileName: string; status: string; updatedAt: string };
export function AnalysisHistory({ displayName }: { displayName: string }) {
  const [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    void workflowApi<{ runs: Run[] }>("/api/ai-field-detection/runs")
      .then((d) => setRuns(d.runs))
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <AppShell displayName={displayName}>
      <PageHeader
        title="AI analysis history"
        description="Review stored form analyses and archive completed or cancelled records. Processing analyses must finish before archiving."
      />
      {error && <p role="alert">{error}</p>}
      <div className="space-y-3">
        {runs.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
          >
            <div>
              <p className="font-medium">{r.fileName}</p>
              <p className="text-sm text-muted-foreground">
                {r.status} · {runDate(r.updatedAt)}
              </p>
            </div>
            <ArchiveButton
              type="ai_run"
              id={r.id}
              label={r.fileName}
              disabled={r.status === "processing"}
              onArchived={() =>
                setRuns((rows) => rows.filter((x) => x.id !== r.id))
              }
            />
          </div>
        ))}
        {!runs.length && !error && (
          <p className="text-sm text-muted-foreground">No analyses.</p>
        )}
      </div>
    </AppShell>
  );
}
