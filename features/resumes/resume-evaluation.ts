import { candidateProfilePrefillRecord } from "@/features/resumes/candidate-profile";
import type { CandidateProfile } from "@/features/resumes/candidate-profile";
import type { CandidatePrefillKey } from "@/features/resumes/resume.types";

export type ResumeEvaluation = {
  expectedCount: number;
  predictedCount: number;
  matchedCount: number;
  precision: number;
  recall: number;
  f1: number;
  meanValueSimilarity: number;
};

export function evaluateResumeProfile(options: {
  expected: Partial<Record<CandidatePrefillKey, string>>;
  predicted: CandidateProfile;
}): ResumeEvaluation {
  const expected = Object.entries(options.expected).filter(([, value]) => Boolean(value));
  const predictedRecord = candidateProfilePrefillRecord(options.predicted);
  const predicted = Object.entries(predictedRecord).filter(([, field]) => Boolean(field.value));
  const similarities = expected.map(([key, value]) =>
    valueSimilarity(String(value), predictedRecord[key]?.value ?? ""),
  );
  const matchedCount = similarities.filter((score) => score >= 0.9).length;
  const precision = ratio(matchedCount, predicted.length);
  const recall = ratio(matchedCount, expected.length);
  return {
    expectedCount: expected.length,
    predictedCount: predicted.length,
    matchedCount,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    meanValueSimilarity: ratio(
      similarities.reduce((total, score) => total + score, 0),
      similarities.length,
    ),
  };
}

function valueSimilarity(left: string, right: string): number {
  const leftValue = normalized(left);
  const rightValue = normalized(right);
  if (!leftValue || !rightValue) return 0;
  if (leftValue === rightValue) return 1;
  const leftTokens = new Set(leftValue.split(" "));
  const rightTokens = new Set(rightValue.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
