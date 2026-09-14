import {
  rectIou,
} from "@/features/ai-field-detection/field-detection";
import type {
  DetectedFieldCandidate,
  FieldDetectionResult,
} from "@/features/ai-field-detection/field-detection";
import type { AcroFormFieldDetection } from "@/features/ai-field-detection/acroform-field-detection";
import { createFieldKey } from "@/features/templates/label-binding";

export function mergeHybridFieldDetection<T extends FieldDetectionResult>(options: {
  acroForm: AcroFormFieldDetection;
  ai: T;
}): T {
  const { acroForm, ai } = options;
  const candidates = acroForm.candidates.map((candidate) => ({ ...candidate }));
  let duplicatesMerged = 0;

  for (const aiCandidate of ai.candidates) {
    const duplicateIndex = bestDuplicateIndex(candidates, aiCandidate);
    if (duplicateIndex < 0) {
      candidates.push({ ...aiCandidate, source: "ai" });
      continue;
    }
    candidates[duplicateIndex] = enrichAcroFormCandidate(
      candidates[duplicateIndex],
      aiCandidate,
    );
    duplicatesMerged += 1;
  }

  ensureUniqueKeys(candidates);
  candidates.sort(compareCandidatePosition);
  return {
    ...ai,
    engine: acroForm.candidates.length
      ? `hybrid:acroform+${ai.engine}`
      : ai.engine,
    candidates,
    pipeline: {
      strategy: acroForm.candidates.length ? "hybrid" : "ai-only",
      acroFormCandidates: acroForm.candidates.length,
      aiCandidates: ai.candidates.length,
      duplicatesMerged,
      readOnlyAcroFormFields: acroForm.readOnlyFields,
      unsupportedAcroFormFields: acroForm.unsupportedFields,
    },
  };
}

export function areDetectionCandidatesDuplicates(
  left: DetectedFieldCandidate,
  right: DetectedFieldCandidate,
): boolean {
  if (left.page !== right.page) return false;
  const overlap = rectIou(left.fieldBox, right.fieldBox);
  if (overlap >= 0.25) return true;
  return overlap >= 0.1 && labelSimilarity(left.label, right.label) >= 0.8;
}

function bestDuplicateIndex(
  candidates: DetectedFieldCandidate[],
  candidate: DetectedFieldCandidate,
): number {
  let bestIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < candidates.length; index += 1) {
    const current = candidates[index];
    if (!areDetectionCandidatesDuplicates(current, candidate)) continue;
    const score =
      rectIou(current.fieldBox, candidate.fieldBox) * 0.8 +
      labelSimilarity(current.label, candidate.label) * 0.2;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function enrichAcroFormCandidate(
  acroForm: DetectedFieldCandidate,
  ai: DetectedFieldCandidate,
): DetectedFieldCandidate {
  const useAiLabel =
    isGenericFieldLabel(acroForm.label) && !isGenericFieldLabel(ai.label);
  return {
    ...acroForm,
    source: "hybrid",
    label: useAiLabel ? ai.label : acroForm.label,
    labelBox: ai.labelBox,
    validation:
      acroForm.tool === "input" && acroForm.validation === "none"
        ? ai.validation
        : acroForm.validation,
    required: acroForm.required || ai.required,
    confidence: Math.max(acroForm.confidence, ai.confidence),
    evidence: `${acroForm.evidence} Visual AI match: ${ai.evidence}`.slice(
      0,
      240,
    ),
  };
}

function ensureUniqueKeys(candidates: DetectedFieldCandidate[]): void {
  const usedKeys = new Set<string>();
  for (const candidate of candidates) {
    const baseKey = createFieldKey(candidate.suggestedKey || candidate.label);
    let key = baseKey;
    for (let suffix = 2; usedKeys.has(key); suffix += 1) {
      const ending = `_${suffix}`;
      key = `${baseKey.slice(0, 64 - ending.length)}${ending}`;
    }
    candidate.suggestedKey = key;
    usedKeys.add(key);
  }
}

function labelSimilarity(left: string, right: string): number {
  const leftValue = normalizedLabel(left);
  const rightValue = normalizedLabel(right);
  if (!leftValue || !rightValue) return 0;
  if (leftValue === rightValue) return 1;
  if (leftValue.includes(rightValue) || rightValue.includes(leftValue)) return 0.9;
  const leftTokens = new Set(leftValue.split(" "));
  const rightTokens = new Set(rightValue.split(" "));
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function normalizedLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isGenericFieldLabel(value: string): boolean {
  return /^(field|text|input|choice|checkbox|dropdown|untitled)\s*\d*$/iu.test(
    value,
  );
}

function compareCandidatePosition(
  left: DetectedFieldCandidate,
  right: DetectedFieldCandidate,
): number {
  if (left.page !== right.page) return left.page - right.page;
  if (left.fieldBox.y !== right.fieldBox.y) {
    return left.fieldBox.y - right.fieldBox.y;
  }
  return left.fieldBox.x - right.fieldBox.x;
}
