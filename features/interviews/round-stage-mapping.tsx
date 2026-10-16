"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SelectField,
  SelectFieldOption,
} from "@/components/patterns/select-field";
import { interviewApi } from "./client";
import type { InterviewProcess, InterviewRound } from "./interviews";
export function RoundStageMapping({
  process,
  round,
  onChanged,
  disabled,
}: {
  process: InterviewProcess;
  round: InterviewRound;
  onChanged: () => void;
  disabled: boolean;
}) {
  const [stageId, setStageId] = useState(round.stageId ?? ""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!process.applicationId) return null;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await interviewApi(`/api/interviews/${process.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: "map_round",
          mutationId: crypto.randomUUID(),
          expectedVersion: process.version,
          roundId: round.id,
          stageId,
          reason,
        }),
      });
      setReason("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not map this round.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="space-y-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm">
        Hiring stage:{" "}
        {process.stageOptions?.find((s) => s.id === round.stageId)?.name ??
          "Not mapped"}
      </summary>
      <div className="space-y-2">
        <Label htmlFor={`round-stage-${round.id}`}>
          Stage satisfied by this round
        </Label>
        <SelectField
          id={`round-stage-${round.id}`}
          value={stageId}
          onValueChange={setStageId}
          disabled={disabled || busy}
          placeholder="Choose an interview stage"
        >
          {process.stageOptions?.map((s) => (
            <SelectFieldOption key={s.id} value={s.id}>
              {s.name}
            </SelectFieldOption>
          ))}
        </SelectField>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`round-mapping-reason-${round.id}`}>
          Mapping reason
        </Label>
        <Input
          id={`round-mapping-reason-${round.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          disabled={disabled || busy}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={
          disabled ||
          busy ||
          !stageId ||
          stageId === round.stageId ||
          reason.trim().length < 10
        }
        onClick={() => void save()}
      >
        Save round mapping
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </details>
  );
}
