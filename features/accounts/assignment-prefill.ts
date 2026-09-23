import type {
  AssignmentAutofillField,
  AssignmentAutofillPreview,
  CandidateProfileOption,
} from "@/features/accounts/account.types";
import {
  isCandidatePrefillEligibleAnnotation,
  isCandidatePrefillKey,
} from "@/features/resumes/candidate-prefill";
import type {
  CandidatePrefillMetadata,
  CandidatePrefillSnapshot,
} from "@/features/resumes/candidate-prefill";
import type { TemplateAnnotation } from "@/features/templates/template.types";
import { candidatePrefillLabel } from "@/features/resumes/candidate-prefill-options";
import { candidateProfilePrefillRecord } from "@/features/resumes/candidate-profile";
import type { CandidateProfile } from "@/features/resumes/candidate-profile";
import type { CandidatePrefillKey } from "@/features/resumes/resume.types";

export function buildAssignmentAutofillPreview(options: {
  annotations: TemplateAnnotation[];
  recipientRoleId: string;
  snapshot: CandidatePrefillSnapshot;
  profile: CandidateProfileOption;
  candidateProfile?: CandidateProfile;
}): AssignmentAutofillPreview {
  const profileFields = options.candidateProfile
    ? Object.entries(candidateProfilePrefillRecord(options.candidateProfile))
      .filter(([key, item]) => isCandidatePrefillKey(key) && Boolean(item.value) && item.confidence >= 0.6)
      .map(([key, item]) => ({
        key: key as CandidatePrefillKey,
        label: candidatePrefillLabel(key as CandidatePrefillKey),
        value: item.value,
        confidence: item.confidence,
        sourcePage: item.sourcePage,
        status: item.confidence >= 0.8 ? "filled" as const : "needs_review" as const,
      }))
    : [];
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
    profileFields,
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

export function defaultApprovedPrefillFieldIds(
  fields: AssignmentAutofillField[],
): string[] {
  return fields
    .filter((field) => field.status === "filled" && Boolean(field.value))
    .map((field) => field.fieldId);
}

export type AssignmentPrefillMode = "suggested" | "automatic" | "none";

export type AssignmentPrefillStorage = {
  initialValues: Record<string, unknown>;
  initialMetadata: Record<string, CandidatePrefillMetadata>;
  availableValues: Record<string, unknown>;
  availableMetadata: Record<string, CandidatePrefillMetadata | {
    prefillKey: CandidatePrefillKey;
    confidence: number;
    sourcePage: number | null;
    verificationStatus: "extracted" | "verified";
  }>;
  approvedFieldIds: string[];
};

export function isAssignmentPrefillMode(
  value: unknown,
): value is AssignmentPrefillMode {
  return value === "suggested" || value === "automatic" || value === "none";
}

export function buildAssignmentPrefillStorage(options: {
  mode: AssignmentPrefillMode;
  snapshot: CandidatePrefillSnapshot;
  allowedFieldIds: string[];
  profile?: CandidateProfile | null;
  allowedProfileKeys?: string[];
}): AssignmentPrefillStorage {
  const allowed = new Set(options.allowedFieldIds);
  const approvedFieldIds = Object.keys(options.snapshot.values).filter(
    (fieldId) => allowed.has(fieldId),
  );
  const values = Object.fromEntries(
    approvedFieldIds.map((fieldId) => [
      fieldId,
      options.snapshot.values[fieldId],
    ]),
  );
  const metadata = Object.fromEntries(
    approvedFieldIds.flatMap((fieldId) => {
      const item = options.snapshot.metadata[fieldId];
      return item ? [[fieldId, item]] : [];
    }),
  );
  const profileRecord = options.profile
    ? candidateProfilePrefillRecord(options.profile)
    : {};
  const profileValues = Object.fromEntries(
    (options.allowedProfileKeys ?? []).flatMap((key) => {
      const item = profileRecord[key];
      return isCandidatePrefillKey(key) && item?.value && item.confidence >= 0.6
        ? [[key, item.value]]
        : [];
    }),
  );
  const profileMetadata = Object.fromEntries(
    Object.keys(profileValues).map((key) => [key, {
      prefillKey: key as CandidatePrefillKey,
      confidence: profileRecord[key].confidence,
      sourcePage: profileRecord[key].sourcePage,
      verificationStatus: "extracted" as const,
    }]),
  );

  if (options.mode === "automatic") {
    return {
      initialValues: values,
      initialMetadata: metadata,
      availableValues: profileValues,
      availableMetadata: profileMetadata,
      approvedFieldIds: [...approvedFieldIds, ...Object.keys(profileValues)],
    };
  }
  if (options.mode === "suggested") {
    return {
      initialValues: {},
      initialMetadata: {},
      availableValues: { ...values, ...profileValues },
      availableMetadata: { ...metadata, ...profileMetadata },
      approvedFieldIds: [...approvedFieldIds, ...Object.keys(profileValues)],
    };
  }
  return {
    initialValues: {},
    initialMetadata: {},
    availableValues: {},
    availableMetadata: {},
    approvedFieldIds: [],
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
