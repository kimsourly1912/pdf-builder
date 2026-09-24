"use client";

import { LoaderCircle, Plus, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";

import { FeedbackAlert } from "@/components/patterns/feedback-alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CandidateProfileCombobox } from "@/features/accounts/candidate-profile-combobox";
import type {
  AssignmentTemplateSummary,
  CandidateProfileOption,
  RecipientAccountSummary,
  RecipientAssignmentSummary,
} from "@/features/accounts/account.types";

type ProfileChoice = {
  id: string;
  option: CandidateProfileOption;
};

export function BatchAssignmentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: RecipientAccountSummary[];
  templates: AssignmentTemplateSummary[];
  onRemove: (accountId: string) => void;
  onAssigned: (accountId: string, assignment: RecipientAssignmentSummary) => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [profiles, setProfiles] = useState<Record<string, ProfileChoice>>({});
  const [withoutResume, setWithoutResume] = useState<Record<string, boolean>>({});
  const [mismatchConfirmed, setMismatchConfirmed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const requestKeys = useRef<Record<string, string>>({});
  const selectedTemplate = props.templates.find((item) => item.id === templateId);
  const roles = selectedTemplate?.currentRoles ?? selectedTemplate?.filterRoles ?? [];
  const ready = props.accounts.length > 0
    && Boolean(templateId && roleId)
    && props.accounts.every((account) => withoutResume[account.id]
      || (profiles[account.id]
        && (profiles[account.id].option.linkedToAccount || mismatchConfirmed[account.id])));

  function updateOpen(open: boolean) {
    if (busy) return;
    props.onOpenChange(open);
    if (!open) {
      setErrors({});
      setCompleted(0);
    }
  }

  async function assign() {
    if (!ready || busy) return;
    setBusy(true);
    setErrors({});
    setCompleted(0);
    let succeeded = 0;
    const failures: Record<string, string> = {};
    for (const account of props.accounts) {
      const choice = profiles[account.id];
      const noResume = Boolean(withoutResume[account.id]);
      const requestKey = requestKeys.current[account.id] ?? crypto.randomUUID();
      requestKeys.current[account.id] = requestKey;
      try {
        const response = await fetch(`/api/accounts/${account.id}/assignments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": requestKey,
          },
          body: JSON.stringify({
            templateId,
            roleId,
            prefillMode: noResume ? "none" : "automatic",
            candidateProfileVersionId: noResume ? null : choice?.id,
            profileMismatchConfirmed: noResume
              ? false
              : Boolean(mismatchConfirmed[account.id]),
          }),
        });
        const payload = await response.json() as {
          assignment?: RecipientAssignmentSummary;
          error?: string;
        };
        if (!response.ok || !payload.assignment) {
          throw new Error(payload.error || "The form could not be assigned.");
        }
        props.onAssigned(account.id, payload.assignment);
        delete requestKeys.current[account.id];
        succeeded += 1;
        setCompleted(succeeded);
      } catch (cause) {
        failures[account.id] = cause instanceof Error
          ? cause.message
          : "The form could not be assigned.";
        setErrors({ ...failures });
      }
    }
    setBusy(false);
    if (Object.keys(failures).length === 0) {
      props.onOpenChange(false);
      setCompleted(0);
      setProfiles({});
      setWithoutResume({});
      setMismatchConfirmed({});
      setTemplateId("");
      setRoleId("");
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={updateOpen}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Assign a form</DialogTitle>
          <DialogDescription>
            Choose a published template, then choose resume data for each selected account.
            PDF Studio mappings determine which fields fill automatically. Unverified low-confidence values remain blank.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 border-b p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="batch-template">Template</label>
            <Select
              value={templateId || undefined}
              disabled={busy}
              onValueChange={(value) => {
                setTemplateId(value);
                const item = props.templates.find((template) => template.id === value);
                const nextRoles = item?.currentRoles ?? item?.filterRoles ?? [];
                setRoleId(nextRoles.length === 1 ? nextRoles[0].id : "");
                requestKeys.current = {};
                setErrors({});
              }}
            >
              <SelectTrigger id="batch-template" className="w-full">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {props.templates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · v{item.versionNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" htmlFor="batch-role">Recipient role</label>
            <Select
              value={roleId || undefined}
              disabled={busy || !selectedTemplate}
              onValueChange={(value) => {
                setRoleId(value);
                requestKeys.current = {};
                setErrors({});
              }}
            >
              <SelectTrigger id="batch-role" className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!busy && Object.keys(errors).length > 0 && (
            <FeedbackAlert
              tone="warning"
              title="Some accounts could not be assigned"
              description="Successful accounts were removed from the selection. Review the errors and retry the remaining accounts."
              className="mb-4"
            />
          )}
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            Selected accounts ({props.accounts.length})
          </p>
          {props.accounts.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No accounts selected. Select accounts from the table to continue.
            </p>
          ) : (
            <ul className="space-y-3" aria-label="Selected accounts">
              {props.accounts.map((account) => {
                const choice = profiles[account.id];
                const noResume = Boolean(withoutResume[account.id]);
                return (
                  <li key={account.id} className="rounded-lg border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <UserRound className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{account.name}</p>
                        <p className="break-all text-xs text-muted-foreground">
                          {account.email} · {account.accountType}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Remove ${account.name} from assignment`}
                        onClick={() => {
                          props.onRemove(account.id);
                          delete requestKeys.current[account.id];
                          setErrors((current) => {
                            const next = { ...current };
                            delete next[account.id];
                            return next;
                          });
                        }}
                      >
                        <X className="size-4" /> Remove
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      <label className="text-xs font-medium">Resume data for {account.name}</label>
                      <CandidateProfileCombobox
                        accountId={account.id}
                        value={noResume ? null : choice?.id ?? null}
                        disabled={busy || noResume}
                        onValueChange={(id, option) => {
                          setProfiles((current) => {
                            const next = { ...current };
                            if (id && option) next[account.id] = { id, option };
                            else delete next[account.id];
                            return next;
                          });
                          setMismatchConfirmed((current) => ({ ...current, [account.id]: false }));
                          delete requestKeys.current[account.id];
                          setErrors((current) => {
                            const next = { ...current };
                            delete next[account.id];
                            return next;
                          });
                        }}
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={noResume}
                          disabled={busy}
                          onCheckedChange={(checked) => {
                            setWithoutResume((current) => ({
                              ...current,
                              [account.id]: checked === true,
                            }));
                            delete requestKeys.current[account.id];
                            setErrors((current) => {
                              const next = { ...current };
                              delete next[account.id];
                              return next;
                            });
                          }}
                        />
                        Assign without resume data
                      </label>
                      {!noResume && !choice && (
                        <p className="text-xs text-warning-foreground">
                          Choose this person’s resume, or explicitly assign without resume data.
                        </p>
                      )}
                      {!noResume && choice && !choice.option.linkedToAccount && (
                        <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-2.5 text-xs">
                          <Checkbox
                            checked={Boolean(mismatchConfirmed[account.id])}
                            disabled={busy}
                            onCheckedChange={(checked) => {
                              setMismatchConfirmed((current) => ({
                                ...current,
                                [account.id]: checked === true,
                              }));
                              delete requestKeys.current[account.id];
                            }}
                          />
                          I confirm this resume belongs to {account.name}, although it is not linked to this account.
                        </label>
                      )}
                      {errors[account.id] && (
                        <p role="alert" className="text-xs text-destructive">{errors[account.id]}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter className="border-t px-5 py-4">
          {busy && <span className="mr-auto text-xs text-muted-foreground">Assigned {completed} so far…</span>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => updateOpen(false)}>
            Close
          </Button>
          <Button type="button" disabled={!ready || busy} onClick={() => void assign()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Assign to {props.accounts.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
