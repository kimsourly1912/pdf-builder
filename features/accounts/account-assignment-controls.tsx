"use client";

import { Eye, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";

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
import type {
  AssignmentAutofillPreview,
  AssignmentDraft,
  AssignmentTemplateSummary,
} from "@/features/accounts/account.types";
import { CandidateProfileCombobox } from "@/features/accounts/candidate-profile-combobox";
import { candidatePrefillLabel } from "@/features/resumes/candidate-prefill-options";
import { cn } from "@/lib/utils";

const EMPTY_DRAFT: AssignmentDraft = {
  templateId: "",
  roleId: "",
  candidateProfileVersionId: null,
  prefillMode: "suggested",
  allowedFieldIds: [],
};

export function AccountAssignmentControls(props: {
  accountId: string;
  accountName: string;
  templates: AssignmentTemplateSummary[];
  busy: boolean;
  onAssign: (draft: AssignmentDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<AssignmentDraft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<AssignmentAutofillPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const selectedTemplate = props.templates.find(
    (template) => template.id === draft.templateId,
  );
  const roles =
    selectedTemplate?.currentRoles ?? selectedTemplate?.filterRoles ?? [];

  async function assign() {
    if (
      draft.prefillMode !== "none"
      && (
        !draft.candidateProfileVersionId
        || !preview
        || draft.allowedFieldIds.length === 0
      )
    ) {
      setPreviewError(
        "Preview the resume data and approve at least one field before assigning.",
      );
      return;
    }
    const assigned = await props.onAssign(draft);
    if (assigned) {
      setDraft(EMPTY_DRAFT);
      setPreview(null);
      setPreviewOpen(false);
      setPreviewError("");
    }
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
        throw new Error(payload.error || "The autofill preview could not be generated.");
      }
      setPreview(payload);
      setDraft((current) => ({
        ...current,
        allowedFieldIds: payload.fields
          .filter((field) => Boolean(field.value))
          .map((field) => field.fieldId),
      }));
      setPreviewOpen(true);
    } catch (cause) {
      setPreviewError(
        cause instanceof Error
          ? cause.message
          : "The autofill preview could not be generated.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <>
      <div className="border-y bg-muted/30 p-4">
        <p className="text-xs font-semibold">Assign a form</p>
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,.8fr)_minmax(0,.9fr)_auto]">
          <Select
            value={draft.templateId || "choose-template"}
            onValueChange={(value) => {
              setDraft((current) => ({
                ...current,
                templateId: value === "choose-template" ? "" : value,
                roleId: "",
                allowedFieldIds: [],
              }));
              setPreview(null);
              setPreviewError("");
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

          <CandidateProfileCombobox
            accountId={props.accountId}
            value={draft.candidateProfileVersionId}
            disabled={props.busy || draft.prefillMode === "none"}
            onValueChange={(candidateProfileVersionId) => {
              setDraft((current) => ({
                ...current,
                candidateProfileVersionId,
                allowedFieldIds: [],
              }));
              setPreview(null);
              setPreviewError("");
            }}
          />

          <Select
            value={draft.roleId || "choose-role"}
            disabled={!selectedTemplate}
            onValueChange={(value) => {
              setDraft((current) => ({
                ...current,
                roleId: value === "choose-role" ? "" : value,
                allowedFieldIds: [],
              }));
              setPreview(null);
              setPreviewError("");
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
              setPreview(null);
              setPreviewOpen(false);
              setPreviewError("");
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
              className="h-9 flex-1 lg:flex-none"
            >
              {previewing
                ? <LoaderCircle className="size-4 animate-spin" />
                : <Eye className="size-4" />}
              Choose fields
            </Button>
            <Button
              type="button"
              disabled={
                props.busy
                || !draft.templateId
                || !draft.roleId
                || (
                  draft.prefillMode !== "none"
                  && (
                    !preview
                    || draft.allowedFieldIds.length === 0
                  )
                )
              }
              onClick={() => void assign()}
              className="h-9 flex-1 lg:flex-none"
            >
              {props.busy
                ? <LoaderCircle className="size-4 animate-spin" />
                : <Plus className="size-4" />}
              Assign
            </Button>
          </div>
        </div>

        {previewError && (
          <FeedbackAlert
            tone="error"
            title="Preview unavailable"
            description={previewError}
            className="mt-3"
          />
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {draft.prefillMode === "none"
            ? "This assignment will not expose or fill any resume data."
            : draft.candidateProfileVersionId
              ? draft.allowedFieldIds.length > 0
                ? `${draft.allowedFieldIds.length} approved field${draft.allowedFieldIds.length === 1 ? "" : "s"} will be frozen with this assignment.`
                : "Choose fields to approve the exact resume data available for this assignment."
              : "Search and choose a resume profile, then approve the fields this user may use."}
        </p>
        {props.templates.length === 0 && (
          <p className="mt-2 text-[11px] text-warning">
            Create and save a template before assigning forms.
          </p>
        )}
      </div>

      <Dialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      >
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
                  {preview.profile.fileName || `profile v${preview.profile.versionNumber}`}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2 border-b bg-muted/30 p-4 sm:grid-cols-5">
                <PreviewMetric label="Filled" value={preview.summary.filledFields} />
                <PreviewMetric label="Needs review" value={preview.summary.needsReviewFields} tone="warning" />
                <PreviewMetric label="Empty" value={preview.summary.emptyFields} />
                <PreviewMetric label="Unmapped" value={preview.summary.unmappedFields} />
                <PreviewMetric label="Total fields" value={preview.summary.totalFields} />
              </div>

              <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
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
                    Select all available
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
                      const checked = draft.allowedFieldIds.includes(field.fieldId);
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
                                        (fieldId) => fieldId !== field.fieldId,
                                      ),
                                }));
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold">{field.fieldLabel}</p>
                                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                    {candidatePrefillLabel(field.prefillKey)} · {field.prefillKey}
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
                                  {field.sourcePage ? ` · source page ${field.sourcePage}` : ""}
                                  {field.verificationStatus ? ` · ${field.verificationStatus}` : ""}
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
    </>
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
