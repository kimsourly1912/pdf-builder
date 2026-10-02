"use client";

import { Link2, LoaderCircle, Unlink } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CandidateProfileCombobox } from "@/features/accounts/candidate-profile-combobox";
import type { CandidateProfileOption, RecipientAccountSummary } from "@/features/accounts/account.types";

export function AccountResumeLink(props: {
  account: RecipientAccountSummary;
  onLinked: (linkedCandidate: RecipientAccountSummary["linkedCandidate"]) => void;
}) {
  const [profile, setProfile] = useState<CandidateProfileOption | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function link() {
    if (!profile || !confirmed || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${props.account.id}/resume-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateProfileVersionId: profile.id }),
      });
      const payload = await response.json() as {
        linkedCandidate?: RecipientAccountSummary["linkedCandidate"];
        error?: string;
      };
      if (!response.ok || !payload.linkedCandidate) {
        throw new Error(payload.error || "The resume could not be linked.");
      }
      props.onLinked(payload.linkedCandidate);
      setProfile(null);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The resume could not be linked.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!props.account.linkedCandidate || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${props.account.id}/resume-link`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCandidateId: props.account.linkedCandidate.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The resume link could not be removed.");
      props.onLinked(null);
      setConfirmUnlink(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The resume link could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b bg-muted/20 p-4" aria-label="Linked resume data">
      <h3 className="text-xs font-semibold">Linked resume data</h3>
      {props.account.linkedCandidate ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="size-4 text-success" />
              {props.account.linkedCandidate.name || "Candidate profile"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This candidate’s resume versions are linked to {props.account.email}.
              Existing form assignments keep their saved snapshots.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={() => setConfirmUnlink(true)}>
            <Unlink className="size-4" /> Unlink
          </Button>
        </div>
      ) : (
        <div className="mt-3 max-w-xl space-y-3">
          <p className="text-xs text-muted-foreground">
            Search for a resume profile, then link its candidate record to this account.
            All resume versions for that candidate will become available here.
          </p>
          <CandidateProfileCombobox
            accountId={props.account.id}
            value={profile?.id ?? null}
            disabled={busy}
            onValueChange={(_, option) => {
              setProfile(option);
              setConfirmed(false);
              setError("");
            }}
          />
          {profile && (
            <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
              <Checkbox
                checked={confirmed}
                disabled={busy}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              I confirm that {profile.candidateName || profile.fileName}’s resume belongs to {props.account.name} ({props.account.email}).
            </label>
          )}
          <Button type="button" size="sm" disabled={!profile || !confirmed || busy}
            onClick={() => void link()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}
            Link resume data
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <AlertDialog open={confirmUnlink} onOpenChange={setConfirmUnlink}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink resume data?</AlertDialogTitle>
            <AlertDialogDescription>
              New assignments will no longer treat this candidate’s resumes as linked to {props.account.email}.
              Existing assignments keep their saved values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => {
              event.preventDefault();
              void unlink();
            }}>
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
