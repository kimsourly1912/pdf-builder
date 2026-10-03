"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { workflowApi, errorText } from "./client";
import { graphChanges } from "./workspace-tools";
import type { WorkflowGraph } from "./workflow";
type Version = {
  version: number;
  name: string;
  publishedAt: string;
  graph: WorkflowGraph;
};
export function PublishHistory({
  id,
  current,
  graph,
  disabled,
  onRestore,
}: {
  id: string;
  current: number;
  graph: WorkflowGraph;
  disabled: boolean;
  onRestore: (version: number) => Promise<void>;
}) {
  const [items, setItems] = useState<Version[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<Version | null>(null),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void workflowApi<{ items: Version[] }>(`/api/workflows/${id}/versions`, {
      signal: controller.signal,
    })
      .then((v) => {
        if (!controller.signal.aborted) {
          setItems(v.items);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, current, attempt]);
  return (
    <section className="mt-4 space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Publish history</h2>
      <p className="text-sm text-muted-foreground">
        Restore a snapshot as a draft for review. Existing executions and the
        live workflow stay on their published version. History before this
        feature includes only the latest available publication.
      </p>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Retry history
          </Button>
        </>
      ) : loading ? (
        <p>Loading history…</p>
      ) : !items.length ? (
        <p>No published versions yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((v) => (
            <li
              key={v.version}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  Version {v.version}
                  {v.version === current ? " · Current publication" : ""}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  {v.name} · {new Date(v.publishedAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => setSelected(v)}
              >
                Review version
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!busy && !open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Restore version {selected?.version} as draft?
            </DialogTitle>
            <DialogDescription>
              This replaces your current draft, including its name. Your current
              draft is saved first. Publication requires a separate review and
              publish action.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {graphChanges(graph, selected.graph).map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button
            disabled={busy || disabled}
            onClick={() => {
              if (!selected) return;
              setBusy(true);
              void onRestore(selected.version)
                .then(() => setSelected(null))
                .catch((e) => setError(errorText(e)))
                .finally(() => setBusy(false));
            }}
          >
            Restore as draft
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
