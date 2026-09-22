"use client";

import { Eye, LoaderCircle, Plus } from "lucide-react";
import { useState } from "react";

import { FeedbackAlert } from "@/components/patterns/feedback-alert";
import { Button } from "@/components/ui/button";
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
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const selectedTemplate = props.templates.find(
    (template) => template.id === draft.templateId,
  );
  const roles =
    selectedTemplate?.currentRoles ?? selectedTemplate?.filterRoles ?? [];

  async function assign() {
    const assigned = await props.onAssign(draft);
    if (assigned) {
      setDraft(EMPTY_DRAFT);
      setPreview(null);
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
        <div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,.8fr)_auto]">
          <Select
            value={draft.templateId || "choose-template"}
            onValueChange={(value) => {
              setDraft((current) => ({
                ...current,
                templateId: value === "choose-template" ? "" : value,
                roleId: "",
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
            disabled={props.busy}
            onValueChange={(candidateProfileVersionId) => {
              setDraft((current) => ({
                ...current,
                candidateProfileVersionId,
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
              }
              onClick={() => void loadPreview()}
              className="h-9 flex-1 lg:flex-none"
            >
              {previewing
                ? <LoaderCircle className="size-4 animate-spin" />
                : <Eye className="size-4" />}
              Preview
            </Button>
            <Button
              type="button"
              disabled={props.busy || !draft.templateId || !draft.roleId}
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
          {draft.candidateProfileVersionId
            ? "Preview the exact values before assigning. The selected profile version will be frozen with the assignment."
            : "Choose resume data to enable automatic filling, or assign without it."}
        </p>
        {props.templates.length === 0 && (
          <p className="mt-2 text-[11px] text-warning">
            Create and save a template before assigning forms.
          </p>
        )}
      </div>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {preview && (
            <>
              <DialogHeader className="border-b px-5 py-4 pr-12">
                <DialogTitle>Auto-fill preview</DialogTitle>
                <DialogDescription>
                  {props.accountName} will receive values from{" "}
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

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {preview.fields.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    This recipient role has no candidate fields mapped yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {preview.fields.map((field) => (
                      <div key={field.fieldId} className="rounded-lg border p-3">
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
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="border-t px-5 py-4" showCloseButton />
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
