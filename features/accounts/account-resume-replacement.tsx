"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CandidateProfileCombobox } from "@/features/accounts/candidate-profile-combobox";
import type {
  AssignmentDraft,
  CandidateProfileOption,
  RecipientAssignmentSummary,
} from "@/features/accounts/account.types";

export function AccountResumeReplacement(props: {
  accountId: string;
  accountName: string;
  assignment: RecipientAssignmentSummary;
  busy: boolean;
  onReplace: (assignmentId: string, expectedUpdatedAt: string, draft: AssignmentDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [profile, setProfile] = useState<CandidateProfileOption | null>(null);
  const [withoutResume, setWithoutResume] = useState(false);
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);
  const [error, setError] = useState("");
  const ready = withoutResume
    || (profile && (profile.linkedToAccount || mismatchConfirmed));

  async function replace() {
    if (!ready || props.busy) return;
    setError("");
    const completed = await props.onReplace(
      props.assignment.id,
      props.assignment.updatedAt,
      {
        templateId: props.assignment.templateId,
        roleId: props.assignment.roleId,
        candidateProfileVersionId: withoutResume ? null : profile?.id ?? null,
        prefillMode: withoutResume ? "none" : "automatic",
        allowedFieldIds: [],
        allowedProfileKeys: [],
        profileMismatchConfirmed: !withoutResume && mismatchConfirmed,
      },
    );
    if (completed) props.onCancel();
    else setError("The resume data could not be replaced. Review the error above and try again.");
  }

  return (
    <div className="border-y bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">Replace resume data</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {props.assignment.templateName} · PDF Studio mappings will fill matching high-confidence fields.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={props.busy} onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
      <div className="mt-4 max-w-lg space-y-2">
        <label className="text-xs font-medium">Resume data for {props.accountName}</label>
        <CandidateProfileCombobox
          accountId={props.accountId}
          value={withoutResume ? null : profile?.id ?? null}
          disabled={props.busy || withoutResume}
          onValueChange={(_, option) => {
            setProfile(option);
            setMismatchConfirmed(false);
            setError("");
          }}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={withoutResume}
            disabled={props.busy}
            onCheckedChange={(checked) => setWithoutResume(checked === true)}
          />
          Remove resume data from this assignment
        </label>
        {!withoutResume && profile && !profile.linkedToAccount && (
          <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs">
            <Checkbox
              checked={mismatchConfirmed}
              disabled={props.busy}
              onCheckedChange={(checked) => setMismatchConfirmed(checked === true)}
            />
            I confirm this resume belongs to {props.accountName}, although it is not linked to this account.
          </label>
        )}
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <Button type="button" disabled={!ready || props.busy} onClick={() => void replace()}>
          {props.busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Replace data
        </Button>
      </div>
    </div>
  );
}
