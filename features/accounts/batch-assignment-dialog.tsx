"use client";

import { Check, ChevronsUpDown, LoaderCircle, Plus, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";

import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [roleByTemplate, setRoleByTemplate] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileChoice>>({});
  const [withoutResume, setWithoutResume] = useState<Record<string, boolean>>({});
  const [mismatchConfirmed, setMismatchConfirmed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [completedPairIds, setCompletedPairIds] = useState<string[]>([]);
  const requestKeys = useRef<Record<string, string>>({});
  const chosenTemplates = templateIds.flatMap((id) => {
    const template = props.templates.find((item) => item.id === id);
    return template ? [template] : [];
  });
  const pendingPairs = props.accounts.flatMap((account) =>
    chosenTemplates.filter((template) => {
      const key = `${account.id}:${template.id}`;
      return !completedPairIds.includes(key)
        && !account.assignments.some((assignment) =>
          assignment.templateId === template.id
          && assignment.versionNumber === template.versionNumber
          && assignment.roleId === roleByTemplate[template.id]);
    }).map((template) => ({ account, template })));
  const ready = props.accounts.length > 0
    && chosenTemplates.length > 0
    && chosenTemplates.every((template) => Boolean(roleByTemplate[template.id]))
    && pendingPairs.length > 0
    && pendingPairs.every(({ account }) => withoutResume[account.id]
      || (profiles[account.id]
        && (profiles[account.id].option.linkedToAccount || mismatchConfirmed[account.id])));

  function updateOpen(open: boolean) {
    if (busy) return;
    props.onOpenChange(open);
    if (!open) {
      setErrors({});
      setCompleted(0);
      setTemplateIds([]);
      setRoleByTemplate({});
      setProfiles({});
      setWithoutResume({});
      setMismatchConfirmed({});
      setTemplatePickerOpen(false);
      requestKeys.current = {};
      setCompletedPairIds([]);
    }
  }

  function forgetAccountRequests(accountId: string) {
    for (const key of Object.keys(requestKeys.current)) {
      if (key.startsWith(`${accountId}:`)) delete requestKeys.current[key];
    }
    setErrors((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${accountId}:`)),
    ));
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
      let allDone = true;
      for (const template of chosenTemplates) {
        const pairKey = `${account.id}:${template.id}`;
        if (completedPairIds.includes(pairKey) || account.assignments.some((assignment) =>
          assignment.templateId === template.id
          && assignment.versionNumber === template.versionNumber
          && assignment.roleId === roleByTemplate[template.id])) continue;
        const requestKey = requestKeys.current[pairKey] ?? crypto.randomUUID();
        requestKeys.current[pairKey] = requestKey;
        try {
          const response = await fetch(`/api/accounts/${account.id}/assignments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": requestKey,
            },
            body: JSON.stringify({
              templateId: template.id,
              roleId: roleByTemplate[template.id],
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
          setCompletedPairIds((current) => [...current, pairKey]);
          delete requestKeys.current[pairKey];
          succeeded += 1;
          setCompleted(succeeded);
        } catch (cause) {
          allDone = false;
          failures[pairKey] = cause instanceof Error
            ? cause.message
            : "The form could not be assigned.";
          setErrors({ ...failures });
        }
      }
      if (allDone) props.onRemove(account.id);
    }
    setBusy(false);
    if (Object.keys(failures).length === 0) {
      props.onOpenChange(false);
      setCompleted(0);
      setProfiles({});
      setWithoutResume({});
      setMismatchConfirmed({});
      setTemplateIds([]);
      setRoleByTemplate({});
      setTemplatePickerOpen(false);
      requestKeys.current = {};
      setCompletedPairIds([]);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={updateOpen}>
      <DialogContent
        className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={!busy}
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Assign forms</DialogTitle>
          <DialogDescription>
            Choose published templates and a role for each, then choose resume data for each selected account.
            PDF Studio mappings determine which fields fill automatically. Unverified low-confidence values remain blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 border-b p-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" id="batch-template-label">Templates</label>
            <Popover open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox"
                  aria-labelledby="batch-template-label" aria-expanded={templatePickerOpen}
                  disabled={busy || completedPairIds.length > 0}
                  className="w-full justify-between font-normal">
                  {templateIds.length ? `${templateIds.length} template${templateIds.length === 1 ? "" : "s"} selected` : "Select templates"}
                  <ChevronsUpDown className="size-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search templates…" />
                  <CommandList>
                    <CommandEmpty>No published templates found.</CommandEmpty>
                    <CommandGroup>
                      {props.templates.map((item) => (
                        <CommandItem key={item.id} value={`${item.name} ${item.versionNumber} ${item.id}`}
                          onSelect={() => {
                            setTemplateIds((current) => current.includes(item.id)
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id]);
                            const roles = item.currentRoles ?? item.filterRoles ?? [];
                            setRoleByTemplate((current) => ({
                              ...current,
                              [item.id]: roles.length === 1 ? roles[0].id : "",
                            }));
                            requestKeys.current = {};
                            setErrors({});
                          }}>
                          <Check className={`size-4 ${templateIds.includes(item.id) ? "opacity-100" : "opacity-0"}`} />
                          {item.name} · v{item.versionNumber}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {chosenTemplates.length > 0 && (
            <div className="max-h-36 space-y-2 overflow-y-auto" aria-label="Recipient roles by template">
              {chosenTemplates.map((template) => (
                <div key={template.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate" title={template.name}>{template.name} · v{template.versionNumber}</span>
                  <Select value={roleByTemplate[template.id] || undefined}
                    disabled={busy || completedPairIds.length > 0}
                    onValueChange={(value) => {
                      setRoleByTemplate((current) => ({ ...current, [template.id]: value }));
                      requestKeys.current = {};
                      setErrors({});
                    }}>
                    <SelectTrigger className="w-44" aria-label={`Role for ${template.name}`}>
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent>
                      {(template.currentRoles ?? template.filterRoles ?? []).map((role) => (
                        <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          {chosenTemplates.length > 0 && <p className="text-xs text-muted-foreground">
            {pendingPairs.length} assignment{pendingPairs.length === 1 ? "" : "s"} to create across {props.accounts.length} account{props.accounts.length === 1 ? "" : "s"}. Existing assignments are skipped.
          </p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!busy && Object.keys(errors).length > 0 && (
            <FeedbackAlert
              tone="warning"
              title="Some accounts could not be assigned"
              description="Completed assignments were saved. Review the errors below and retry the remaining templates."
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
                          forgetAccountRequests(account.id);
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
                        disabled={busy || noResume || completedPairIds.length > 0}
                        onValueChange={(id, option) => {
                          setProfiles((current) => {
                            const next = { ...current };
                            if (id && option) next[account.id] = { id, option };
                            else delete next[account.id];
                            return next;
                          });
                          setMismatchConfirmed((current) => ({ ...current, [account.id]: false }));
                          forgetAccountRequests(account.id);
                        }}
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox
                          checked={noResume}
                          disabled={busy || completedPairIds.length > 0}
                          onCheckedChange={(checked) => {
                            setWithoutResume((current) => ({
                              ...current,
                              [account.id]: checked === true,
                            }));
                            forgetAccountRequests(account.id);
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
                            disabled={busy || completedPairIds.length > 0}
                            onCheckedChange={(checked) => {
                              setMismatchConfirmed((current) => ({
                                ...current,
                                [account.id]: checked === true,
                              }));
                              forgetAccountRequests(account.id);
                            }}
                          />
                          I confirm this resume belongs to {account.name}, although it is not linked to this account.
                        </label>
                      )}
                      {chosenTemplates.map((template) => errors[`${account.id}:${template.id}`] && (
                        <p key={template.id} role="alert" className="text-xs text-destructive">
                          {template.name}: {errors[`${account.id}:${template.id}`]}
                        </p>
                      ))}
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
            Assign {pendingPairs.length} form{pendingPairs.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
