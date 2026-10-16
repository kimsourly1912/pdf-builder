"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import type { CandidateProgress } from "@/features/candidate-progress/progress";
import { interviewApi } from "./client";
import { preparationChanges } from "./preparation-context";
import type { InterviewProcess } from "./interviews";
import type { HiringApplication } from "@/features/hiring/hiring";
export function PreparationContextPanel({
  process,
}: {
  process: InterviewProcess;
}) {
  const [changes, setChanges] = useState<string[] | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if(process.applicationId){
      interviewApi<{application:HiringApplication;facts:{cv_approved:boolean}}>(`/api/hiring/applications/${process.applicationId}`).then(({application,facts})=>{
        if(cancelled)return;
        const notes:string[]=[];
        if(application.resumeId!==process.snapshot.cv.id)notes.push("The application's CV has changed.");
        if(!facts.cv_approved)notes.push("Current CV approval needs review; the original interview context is retained.");
        if((application.evidence.runId??null)!==process.snapshot.runId)notes.push("Application preparation was linked after the original interview context was captured.");
        setChanges(notes);setFailed(false);
      }).catch(()=>{if(!cancelled)setFailed(true);});
      return()=>{cancelled=true;};
    }
    interviewApi<{ candidate: CandidateProgress }>(
      `/api/candidates/${process.candidateId}`,
    )
      .then(({ candidate }) => {
        if (!cancelled) {
          setChanges(preparationChanges(process.snapshot, candidate));
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [process.applicationId, process.candidateId, process.snapshot, retry]);
  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{process.snapshot.contextKind === "approved_cv" ? "Original application context" : "Accepted interview context"}</Badge>
        {changes && (
          <Badge variant="outline">
            {changes.length
              ? "Later changes detected"
              : process.applicationId ? "Application context matches" : "Current preparation matches"}
          </Badge>
        )}
      </div>
      <p className="text-sm">
        Interviews continue using the CV and accepted forms saved at handoff.
        Later edits do not replace that evidence.
      </p>
      {changes?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      ) : (
        changes && (
          <p className="text-xs text-muted-foreground">
            The selected CV, preparation run and required form versions still
            match.
          </p>
        )
      )}
      {!changes && !failed && (
        <p role="status" className="text-xs text-muted-foreground">
          Checking current preparation…
        </p>
      )}
      {failed && (
        <FeedbackAlert
          title="Current preparation could not be compared"
          description={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFailed(false);
                setRetry(retry + 1);
              }}
            >
              Retry comparison
            </Button>
          }
        />
      )}
      <Button asChild size="sm" variant="outline">
        <Link href={`/candidates/${process.candidateId}`}>
          View current preparation
        </Link>
      </Button>
    </div>
  );
}
