import type {
  AssignmentAutofillField,
  AssignmentAutofillPreview,
  CandidateProfileOption,
} from "@/features/accounts/account.types";
import {
  isCandidatePrefillEligibleAnnotation,
  isCandidatePrefillKey,
} from "@/features/resumes/candidate-prefill";
import type { CandidatePrefillSnapshot } from "@/features/resumes/candidate-prefill";
import type { TemplateAnnotation } from "@/features/templates/template.types";

export function buildAssignmentAutofillPreview(options: {
  annotations: TemplateAnnotation[];
  recipientRoleId: string;
  snapshot: CandidatePrefillSnapshot;
  profile: CandidateProfileOption;
}): AssignmentAutofillPreview {
  const eligibleFields = options.annotations.filter((annotation) =>
    isCandidatePrefillEligibleAnnotation(annotation, options.recipientRoleId),
  );
  const mappedFields = eligibleFields.filter((annotation) =>
    isCandidatePrefillKey(annotation.prefillKey),
  );
  const fields: AssignmentAutofillField[] = mappedFields.flatMap((annotation) => {
    if (!isCandidatePrefillKey(annotation.prefillKey)) return [];
    const metadata = options.snapshot.metadata[annotation.id];
    const rawValue = options.snapshot.values[annotation.id];
    const value = previewValue(rawValue);
    const needsReview = Boolean(
      metadata
      && (
        metadata.verificationStatus !== "verified"
        || metadata.confidence < 0.8
      ),
    );
    return [{
      fieldId: annotation.id,
      fieldLabel: annotationLabel(annotation),
      prefillKey: annotation.prefillKey,
      value,
      confidence: metadata?.confidence ?? null,
      sourcePage: metadata?.sourcePage ?? null,
      verificationStatus: metadata?.verificationStatus ?? null,
      status: value
        ? needsReview ? "needs_review" : "filled"
        : "empty",
    }];
  });
  return {
    profile: options.profile,
    summary: {
      totalFields: eligibleFields.length,
      mappedFields: mappedFields.length,
      filledFields: fields.filter((field) => field.status !== "empty").length,
      emptyFields: fields.filter((field) => field.status === "empty").length,
      needsReviewFields: fields.filter((field) => field.status === "needs_review").length,
      unmappedFields: eligibleFields.length - mappedFields.length,
    },
    fields,
  };
}

function annotationLabel(annotation: TemplateAnnotation): string {
  const fieldName = typeof annotation.fieldName === "string"
    ? annotation.fieldName.trim()
    : "";
  const boundLabel = annotation.labelBinding?.text?.trim() ?? "";
  const fieldKey = typeof annotation.fieldKey === "string"
    ? annotation.fieldKey.trim()
    : "";
  return fieldName || boundLabel || fieldKey || `${annotation.type} field`;
}

function previewValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
