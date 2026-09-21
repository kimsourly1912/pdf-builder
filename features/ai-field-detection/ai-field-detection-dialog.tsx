"use client";

import { LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AI_FIELD_TOOLS,
  confidenceBand,
} from "@/features/ai-field-detection/field-detection";
import type {
  AiFieldTool,
  DetectedFieldCandidate,
  FieldDetectionSource,
} from "@/features/ai-field-detection/field-detection";
import type { AiFieldDetectionRunStatus } from "@/features/ai-field-detection/run-types";
import { CANDIDATE_PREFILL_KEYS } from "@/features/resumes/resume.types";
import type { CandidatePrefillKey } from "@/features/resumes/resume.types";

export function AiFieldDetectionDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: DetectedFieldCandidate[];
  isDetecting: boolean;
  isApplying: boolean;
  status: AiFieldDetectionRunStatus | null;
  error: string;
  onDetect: () => void;
  onApply: (candidates: DetectedFieldCandidate[]) => Promise<void>;
}) {
  const {
    open,
    onOpenChange,
    candidates,
    isDetecting,
    isApplying,
    status,
    error,
    onDetect,
    onApply,
  } = props;
  const [drafts, setDrafts] = useState<DetectedFieldCandidate[]>(() =>
    candidates.map((candidate) => ({ ...candidate })),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () =>
      new Set(
        candidates
          .filter((candidate) => confidenceBand(candidate.confidence) !== "low")
          .map((candidate) => candidate.candidateId),
      ),
  );

  const selectedCandidates = useMemo(
    () => drafts.filter((candidate) => selectedIds.has(candidate.candidateId)),
    [drafts, selectedIds],
  );

  function toggleCandidate(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function updateCandidate(
    id: string,
    changes: Partial<DetectedFieldCandidate>,
  ) {
    setDrafts((current) =>
      current.map((candidate) =>
        candidate.candidateId === id
          ? { ...candidate, ...changes }
          : candidate,
      ),
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100dvw-1rem)] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-violet-600" /> AI field detection
          </DialogTitle>
          <DialogDescription>
            AI suggestions are added only after your review. The current PDF and
            published templates are not changed automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-5">
          {isDetecting ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <LoaderCircle className="size-8 animate-spin text-violet-600" />
              <div>
                <p className="font-medium">Analyzing labels and field areas</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {status === "queued"
                    ? "Queued securely. You can close this dialog and resume from the saved draft."
                    : "Processing in the background. This draft can resume the analysis after a reload."}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="my-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <TriangleAlert className="size-4" /> Analysis failed
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-violet-100 p-3 text-violet-700">
                <Sparkles className="size-6" />
              </div>
              <div className="max-w-md">
                <p className="font-medium">Create a reviewable field draft</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The AI will suggest labels, stable keys, tools, and normalized
                  positions. Nothing is added until you approve it.
                </p>
              </div>
              <Button type="button" onClick={onDetect}>
                <Sparkles className="size-4" /> Analyze PDF
              </Button>
            </div>
          ) : (
            <div className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  <span className="font-semibold">{drafts.length}</span> fields
                  detected · {selectedCandidates.length} selected
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      setSelectedIds(
                        new Set(drafts.map((candidate) => candidate.candidateId)),
                      )
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              {drafts.map((candidate) => {
                const band = confidenceBand(candidate.confidence);
                return (
                  <div
                    key={candidate.candidateId}
                    className="rounded-lg border bg-card p-3 shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedIds.has(candidate.candidateId)}
                        onCheckedChange={(checked) =>
                          toggleCandidate(candidate.candidateId, checked === true)
                        }
                        aria-label={`Select ${candidate.label}`}
                        className="mt-2"
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            Page {candidate.page}
                          </span>
                          <SourceBadge source={candidate.source ?? "ai"} />
                          <ConfidenceBadge band={band} value={candidate.confidence} />
                          {candidate.required && (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                              Required
                            </span>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-xs font-medium">
                            <span>Field label</span>
                            <Input
                              value={candidate.label}
                              onChange={(event) =>
                                updateCandidate(candidate.candidateId, {
                                  label: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="space-y-1 text-xs font-medium">
                            <span>Field key</span>
                            <Input
                              value={candidate.suggestedKey}
                              onChange={(event) =>
                                updateCandidate(candidate.candidateId, {
                                  suggestedKey: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="space-y-1 text-xs font-medium">
                            <span>Tool</span>
                            <Select
                              value={candidate.tool}
                              onValueChange={(tool) =>
                                updateCandidate(candidate.candidateId, {
                                  tool: tool as AiFieldTool,
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AI_FIELD_TOOLS.filter(
                                  (tool) =>
                                    tool !== "dropdown" ||
                                    candidate.options.length >= 2,
                                ).map((tool) => (
                                  <SelectItem key={tool} value={tool}>
                                    {toolLabel(tool)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                          <label className="space-y-1 text-xs font-medium">
                            <span>Candidate auto-fill</span>
                            <Select
                              value={candidate.suggestedPrefillKey ?? "none"}
                              onValueChange={(value) =>
                                updateCandidate(candidate.candidateId, {
                                  suggestedPrefillKey: value === "none"
                                    ? undefined
                                    : value as CandidatePrefillKey,
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No auto-fill</SelectItem>
                                {CANDIDATE_PREFILL_KEYS.map((key) => (
                                  <SelectItem key={key} value={key}>
                                    {candidatePrefillLabel(key)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </label>
                        </div>
                        {candidate.evidence && (
                          <p className="text-xs leading-5 text-muted-foreground">
                            {candidate.evidence}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={isApplying}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {error && (
            <Button type="button" disabled={isApplying} onClick={onDetect}>
              Try again
            </Button>
          )}
          {drafts.length > 0 && !isDetecting && (
            <Button
              type="button"
              disabled={selectedCandidates.length === 0 || isApplying}
              onClick={() => void onApply(selectedCandidates)}
            >
              {isApplying ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" /> Saving review
                </>
              ) : (
                <>
                  Add {selectedCandidates.length} field
                  {selectedCandidates.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceBadge(props: { source: FieldDetectionSource }) {
  const { source } = props;
  const label =
    source === "acroform"
      ? "Embedded form"
      : source === "hybrid"
        ? "Form + AI"
        : "Visual AI";
  const style =
    source === "acroform"
      ? "bg-blue-100 text-blue-700"
      : source === "hybrid"
        ? "bg-violet-100 text-violet-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

function ConfidenceBadge(props: {
  band: "high" | "review" | "low";
  value: number;
}) {
  const { band, value } = props;
  const style =
    band === "high"
      ? "bg-emerald-100 text-emerald-700"
      : band === "review"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";
  const label = band === "high" ? "High" : band === "review" ? "Review" : "Low";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label} {Math.round(value * 100)}%
    </span>
  );
}

function toolLabel(tool: AiFieldTool): string {
  if (tool === "input") return "Text input";
  if (tool === "textarea") return "Text area";
  if (tool === "dropdown") return "Dropdown";
  if (tool === "checkbox") return "Checkbox";
  return "Date picker";
}


function candidatePrefillLabel(key: CandidatePrefillKey): string {
  return key
    .replace(/^candidate\./u, "")
    .replaceAll("_", " ")
    .replace(/^./u, (letter) => letter.toUpperCase());
}
