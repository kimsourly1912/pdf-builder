"use client";

import { Eye, LoaderCircle, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";

import { FeedbackAlert } from "@/components/patterns/feedback-alert";
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
import {
  defaultApprovedPrefillFieldIds,
} from "@/features/accounts/assignment-prefill";
import type {
  AssignmentAutofillPreview,
  AssignmentDraft,
  AssignmentTemplateSummary,
  CandidateProfileOption,
  RecipientAssignmentSummary,
} from "@/features/accounts/account.types";
import { CandidateProfileCombobox } from "@/features/accounts/candidate-profile-combobox";
import { candidatePrefillLabel } from "@/features/resumes/candidate-prefill-options";
import { cn } from "@/lib/utils";

function emptyDraft(
  replacement?: RecipientAssignmentSummary | null,
): AssignmentDraft {
  return {
    templateId: replacement?.templateId ?? "",
    roleId: replacement?.roleId ?? "",
    candidateProfileVersionId: null,
    prefillMode: replacement?.prefillMode ?? "suggested",
    allowedFieldIds: [],
  };
}

type AccountAssignmentControlsProps = {
  accountId: string;
  accountName: string;
  templates: AssignmentTemplateSummary[];
  busy: boolean;
  replacement?: RecipientAssignmentSummary | null;
  onAssign: (draft: AssignmentDraft) => Promise<boolean>;
  onReplace?: (
    assignmentId: string,
    expectedUpdatedAt: string,
    draft: AssignmentDraft,
  ) => Promise<boolean>;
  onCancelReplacement?: () => void;
};

export function AccountAssignmentControls(
  props: AccountAssignmentControlsProps,
) {
  const stateKey = props.replacement
    ? `replace:${props.replacement.id}:${props.replacement.updatedAt}`
    : "assign";
  return <AccountAssignmentControlsStateful key={stateKey} {...props} />;
}

function AccountAssignmentControlsStateful(
  props: AccountAssignmentControlsProps,
) {
  const requestKeyRef = useRef(crypto.randomUUID());
  const [draft, setDraft] = useState<AssignmentDraft>(
    () => emptyDraft(props.replacement),
  );
  const [selectedProfile, setSelectedProfile] =
    useState<CandidateProfileOption | null>(null);
  const [preview, setPreview] =
    useState<AssignmentAutofillPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mismatchOpen, setMismatchOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const selectedTemplate = props.templates.find(
    (template) => template.id === draft.templateId,
  );
  const roles =
    selectedTemplate?.currentRoles ?? selectedTemplate?.filterRoles ?? [];
  const replacing = Boolean(props.replacement);

  function resetPreview() {
    setPreview(null);
    setPreviewOpen(false);
    setPreviewError("");
    setDraft((current) => ({ ...current, allowedFieldIds: [] }));
  }

  async function performSubmit(profileMismatchConfirmed: boolean) {
    const submittedDraft: AssignmentDraft = {
      ...draft,
      profileMismatchConfirmed,
      requestKey: requestKeyRef.current,
    };
    const completed = props.replacement && props.onReplace
      ? await props.onReplace(
          props.replacement.id,
          props.replacement.updatedAt,
          submittedDraft,
        )
      : await props.onAssign(submittedDraft);
    if (completed) {
      requestKeyRef.current = crypto.randomUUID();
      setDraft(emptyDraft());
      setSelectedProfile(null);
      setPreview(null);
      setPreviewOpen(false);
      setPreviewError("");
      props.onCancelReplacement?.();
    }
  }

  async function submit() {
    if (
      draft.prefillMode !== "none"
      && (
        !draft.candidateProfileVersionId
        || !preview
        || draft.allowedFieldIds.length === 0
      )
    ) {
      setPreviewError(
        "Review the resume data and approve at least one field first.",
      );
      return;
    }
    if (
      draft.prefillMode !== "none"
      && selectedProfile
      && !selectedProfile.linkedToAccount
    ) {
      setMismatchOpen(true);
      return;
    }
    await performSubmit(true);
  }

  async function loadPreview() {
    if (
      !draft.templateId
      || !draft.roleId
      || !draft.candidateProfileVersionId
    ) {
      setPreviewError(
        "Choose a template, candidate profile, and recipient role first.",
      );
      return;
    }
    setPreviewing(true);
    setPreviewError("");
    try {
      const query = new URLSearchParams({
        templateId: draft.templateId,
        roleId: draft.roleId,
        candidateProfileVersionId: draft.candidateProfileVersionId,
      });
      const response = await fetch(
        `/api/accounts/${props.accountId}/assignments/preview?${query}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as AssignmentAutofillPreview & {
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        throw new Error(
          payload.error || "The resume preview could not be generated.",
        );
      }
      setPreview(payload);
      setSelectedProfile(payload.profile);
      setDraft((current) => ({
        ...current,
        allowedFieldIds: defaultApprovedPrefillFieldIds(payload.fields),
      }));
      setPreviewOpen(true);
    } catch (cause) {
      setPreviewError(
        cause instanceof Error
          ? cause.message
          : "The resume preview could not be generated.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <>
      <div className="border-y bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold">
              {replacing ? "Replace resume data" : "Assign a form"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {replacing
                ? `Update the frozen resume snapshot for ${props.replacement?.templateName}. The form version and role stay unchanged.`
                : "Follow the four steps, review the exact fields, then assign."}
            </p>
          </div>
          {replacing && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={props.busy}
              onClick={props.onCancelReplacement}
            >
              Cancel replacement
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <GuidedField step="1" label="Template">
            <Select
              value={draft.templateId || "choose-template"}
              disabled={replacing}
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  templateId: value === "choose-template" ? "" : value,
                  roleId: "",
                  allowedFieldIds: [],
                }));
                setSelectedProfile(null);
                resetPreview();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="choose-template">Choose template</SelectItem>
                {props.templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} · v{template.versionNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuidedField>

          <GuidedField step="2" label="Resume profile">
            <CandidateProfileCombobox
              accountId={props.accountId}
              value={draft.candidateProfileVersionId}
              disabled={props.busy || draft.prefillMode === "none"}
              onValueChange={(candidateProfileVersionId, option) => {
                setDraft((current) => ({
                  ...current,
                  candidateProfileVersionId,
                  profileMismatchConfirmed: false,
                  allowedFieldIds: [],
                }));
                setSelectedProfile(option);
                resetPreview();
              }}
            />
          </GuidedField>

          <GuidedField step="3" label="Recipient role">
            <Select
              value={draft.roleId || "choose-role"}
              disabled={!selectedTemplate || replacing}
              onValueChange={(value) => {
                setDraft((current) => ({
                  ...current,
                  roleId: value === "choose-role" ? "" : value,
                  allowedFieldIds: [],
                }));
                resetPreview();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="choose-role">Choose role</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </GuidedField>

          <GuidedField step="4" label="Resume behavior">
            <Select
              value={draft.prefillMode}
              onValueChange={(value) => {
                const prefillMode = value as AssignmentDraft["prefillMode"];
                setDraft((current) => ({
                  ...current,
                  prefillMode,
                  candidateProfileVersionId:
                    prefillMode === "none"
                      ? null
                      : current.candidateProfileVersionId,
                  allowedFieldIds: [],
                }));
                if (prefillMode === "none") setSelectedProfile(null);
                resetPreview();
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="suggested">Recipient chooses</SelectItem>
                <SelectItem value="automatic">Fill automatically</SelectItem>
                <SelectItem value="none">No resume data</SelectItem>
              </SelectContent>
            </Select>
          </GuidedField>
        </div>

        {selectedProfile && !selectedProfile.linkedToAccount && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            This profile is not linked to {props.accountName}. You will need to
            confirm the mismatch before sharing any values.
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {draft.prefillMode === "none"
              ? "No resume values will be exposed or filled."
              : draft.allowedFieldIds.length > 0
                ? `${draft.allowedFieldIds.length} approved field${draft.allowedFieldIds.length === 1 ? "" : "s"} will be frozen with this assignment.`
                : "Choose a resume and review the fields. Low-confidence values are unchecked by default."}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                props.busy
                || previewing
                || !draft.templateId
                || !draft.roleId
                || !draft.candidateProfileVersionId
                || draft.prefillMode === "none"
              }
              onClick={() => void loadPreview()}
            >
              {previewing
                ? <LoaderCircle className="size-4 animate-spin" />
                : <Eye className="size-4" />}
              Review fields
            </Button>
            <Button
              type="button"
              disabled={
                props.busy
                || !draft.templateId
                || !draft.roleId
                || (
                  draft.prefillMode !== "none"
                  && (!preview || draft.allowedFieldIds.length === 0)
                )
              }
              onClick={() => void submit()}
            >
              {props.busy
                ? <LoaderCircle className="size-4 animate-spin" />
                : replacing
                  ? <RefreshCw className="size-4" />
                  : <Plus className="size-4" />}
              {replacing ? "Replace snapshot" : "Assign"}
            </Button>
          </div>
        </div>

        {previewError && (
          <FeedbackAlert
            tone="error"
            title="Resume data unavailable"
            description={previewError}
            className="mt-3"
          />
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {preview && (
            <>
              <DialogHeader className="border-b px-5 py-4 pr-12">
                <DialogTitle>Choose resume fields</DialogTitle>
                <DialogDescription>
                  Approve the exact fields {props.accountName} may use from{" "}
                  <span className="font-medium text-foreground">
                    {preview.profile.candidateName}
                  </span>
                  {" · "}
                  {preview.profile.fileName
                    || `profile v${preview.profile.versionNumber}`}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 border-b bg-muted/30 p-4 sm:grid-cols-5">
                <PreviewMetric label="Available" value={preview.summary.filledFields} />
                <PreviewMetric label="Needs review" value={preview.summary.needsReviewFields} tone="warning" />
                <PreviewMetric label="Empty" value={preview.summary.emptyFields} />
                <PreviewMetric label="Unmapped" value={preview.summary.unmappedFields} />
                <PreviewMetric label="Total fields" value={preview.summary.totalFields} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {draft.allowedFieldIds.length} of {preview.summary.filledFields} available fields approved
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      allowedFieldIds: [],
                    }))}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      allowedFieldIds: preview.fields
                        .filter((field) => Boolean(field.value))
                        .map((field) => field.fieldId),
                    }))}
                  >
                    Select all, including review
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {preview.fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    This recipient role has no candidate fields mapped yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {preview.fields.map((field) => {
                      const checked =
                        draft.allowedFieldIds.includes(field.fieldId);
                      return (
                        <div
                          key={field.fieldId}
                          className={cn(
                            "rounded-lg border p-3 transition-colors",
                            checked && "border-primary/50 bg-primary/5",
                            !field.value && "opacity-65",
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              aria-label={`Allow ${field.fieldLabel}`}
                              checked={checked}
                              disabled={!field.value}
                              onCheckedChange={(nextChecked) => {
                                setDraft((current) => ({
                                  ...current,
                                  allowedFieldIds: nextChecked
                                    ? [...new Set([
                                        ...current.allowedFieldIds,
                                        field.fieldId,
                                      ])]
                                    : current.allowedFieldIds.filter(
                                        (fieldId) =>
                                          fieldId !== field.fieldId,
                                      ),
                                }));
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">
                                    {field.fieldLabel}
                                  </p>
                                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                    {candidatePrefillLabel(field.prefillKey)}
                                    {" · "}{field.prefillKey}
                                  </p>
                                </div>
                                <span className={cn(
                                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                  field.status === "filled"
                                    ? "border-success/30 bg-success/10 text-success"
                                    : field.status === "needs_review"
                                      ? "border-warning/30 bg-warning/10 text-warning"
                                      : "border-border bg-muted text-muted-foreground",
                                )}>
                                  {field.status === "needs_review"
                                    ? "Needs review"
                                    : field.status === "filled"
                                      ? "Ready"
                                      : "No value"}
                                </span>
                              </div>
                              <p className={cn(
                                "mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-2 text-xs",
                                !field.value && "italic text-muted-foreground",
                              )}>
                                {field.value || "This field will remain empty."}
                              </p>
                              {field.confidence !== null && (
                                <p className="mt-1.5 text-[10px] text-muted-foreground">
                                  {Math.round(field.confidence * 100)}% confidence
                                  {field.sourcePage
                                    ? ` · source page ${field.sourcePage}`
                                    : ""}
                                  {field.verificationStatus
                                    ? ` · ${field.verificationStatus}`
                                    : ""}
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
                  onClick={() => setPreviewOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={draft.allowedFieldIds.length === 0}
                  onClick={() => setPreviewOpen(false)}
                >
                  Approve selected fields
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={mismatchOpen} onOpenChange={setMismatchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share a different candidate’s data?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedProfile?.candidateName || "This candidate profile"} is
              not linked to {props.accountName}. Confirm only if you intentionally
              want this account to receive the selected resume fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void performSubmit(true)}
            >
              Confirm and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function GuidedField(props: {
  step: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-2 text-[11px] font-semibold">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">
          {props.step}
        </span>
        {props.label}
      </p>
      {props.children}
    </div>
  );
}

function PreviewMetric(props: {
  label: string;
  value: number;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className={cn(
        "text-lg font-semibold",
        props.tone === "warning" && "text-warning",
      )}>
        {props.value}
      </p>
      <p className="text-[10px] text-muted-foreground">{props.label}</p>
    </div>
  );
}
