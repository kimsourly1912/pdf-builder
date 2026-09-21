import {
  AI_FIELD_TOOLS,
  type AiFieldTool,
  type DetectedFieldCandidate,
} from "@/features/ai-field-detection/field-detection";
import { isCandidatePrefillKey } from "@/features/resumes/candidate-prefill";
import {
  createFieldKey,
} from "@/features/templates/label-binding";

type ReviewCandidateInput = {
  candidateId?: unknown;
  label?: unknown;
  suggestedKey?: unknown;
  suggestedPrefillKey?: unknown;
  tool?: unknown;
};

const TOOL_SET = new Set<string>(AI_FIELD_TOOLS);

export function parseReviewedFieldCandidates(options: {
  value: unknown;
  detected: DetectedFieldCandidate[];
}): DetectedFieldCandidate[] | null {
  const { value, detected } = options;
  if (!Array.isArray(value) || value.length > detected.length) return null;

  const detectedById = new Map(
    detected.map((candidate) => [candidate.candidateId, candidate]),
  );
  const usedCandidateIds = new Set<string>();
  const usedKeys = new Set<string>();
  const reviewed: DetectedFieldCandidate[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const input = raw as ReviewCandidateInput;
    const candidateId = cleanString(input.candidateId, 100);
    const original = detectedById.get(candidateId);
    if (!original || usedCandidateIds.has(candidateId)) return null;

    const label = cleanString(input.label, 160);
    if (!label) return null;
    const requestedTool = cleanString(input.tool, 30);
    if (!TOOL_SET.has(requestedTool)) return null;
    const tool = requestedTool as AiFieldTool;
    if (tool === "dropdown" && original.options.length < 2) return null;

    const requestedKey = createFieldKey(
      cleanString(input.suggestedKey, 120) || label,
    );
    const suggestedKey = uniqueReviewedKey(requestedKey, usedKeys);
    const requestedPrefillKey = cleanString(input.suggestedPrefillKey, 120);
    if (
      requestedPrefillKey
      && requestedPrefillKey !== "none"
      && !isCandidatePrefillKey(requestedPrefillKey)
    ) {
      return null;
    }
    const suggestedPrefillKey = requestedPrefillKey === "none"
      ? undefined
      : requestedPrefillKey || original.suggestedPrefillKey;
    usedCandidateIds.add(candidateId);
    usedKeys.add(suggestedKey);
    reviewed.push({
      ...original,
      label,
      suggestedKey,
      suggestedPrefillKey,
      tool,
      validation: tool === "input" ? original.validation : "none",
    });
  }

  return reviewed;
}

function uniqueReviewedKey(value: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(value)) return value;
  for (let suffix = 2; suffix <= usedKeys.size + 2; suffix += 1) {
    const ending = `_${suffix}`;
    const candidate = `${value.slice(0, 64 - ending.length)}${ending}`;
    if (!usedKeys.has(candidate)) return candidate;
  }
  return createFieldKey(`field_${usedKeys.size + 1}`);
}

function cleanString(value: unknown, maximumLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}
