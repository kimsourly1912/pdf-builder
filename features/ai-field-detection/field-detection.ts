import {
  annotationFieldKey,
  createFieldKey,
  createUniqueFieldKey,
} from "@/features/templates/label-binding";
import type { TemplateAnnotation } from "@/features/templates/template.types";

export const AI_FIELD_TOOLS = [
  "input",
  "textarea",
  "dropdown",
  "checkbox",
  "date",
] as const;

export type AiFieldTool = (typeof AI_FIELD_TOOLS)[number];
export type AiFieldValidation = "none" | "email" | "number" | "phone";

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DetectedFieldCandidate = {
  candidateId: string;
  page: number;
  label: string;
  suggestedKey: string;
  tool: AiFieldTool;
  validation: AiFieldValidation;
  labelBox: NormalizedRect;
  fieldBox: NormalizedRect;
  required: boolean;
  confidence: number;
  evidence: string;
  options: string[];
};

export type FieldDetectionResult = {
  schemaVersion: 1;
  engine: string;
  pageCount: number;
  candidates: DetectedFieldCandidate[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export type DetectionEvaluationField = Pick<
  DetectedFieldCandidate,
  "page" | "label" | "tool" | "fieldBox"
>;

export type DetectionEvaluation = {
  expectedCount: number;
  predictedCount: number;
  matchedCount: number;
  precision: number;
  recall: number;
  f1: number;
  labelAccuracy: number;
  toolAccuracy: number;
  meanFieldIou: number;
  usablePositionRate: number;
};

const TOOL_SET = new Set<string>(AI_FIELD_TOOLS);
const VALIDATIONS = new Set<AiFieldValidation>([
  "none",
  "email",
  "number",
  "phone",
]);

export function normalizeFieldDetectionResult(options: {
  value: unknown;
  pageCount: number;
  engine: string;
  idFactory?: () => string;
}): FieldDetectionResult {
  const { value, pageCount, engine, idFactory = () => crypto.randomUUID() } =
    options;
  const record = objectValue(value);
  const rawCandidates = Array.isArray(record?.fields) ? record.fields : [];
  const usedKeys = new Set<string>();
  const candidates: DetectedFieldCandidate[] = [];

  for (const rawCandidate of rawCandidates.slice(0, 300)) {
    const candidate = normalizeCandidate({
      value: rawCandidate,
      pageCount,
      idFactory,
    });
    if (!candidate) continue;
    candidate.suggestedKey = uniqueKey(candidate.suggestedKey, usedKeys);
    usedKeys.add(candidate.suggestedKey);
    candidates.push(candidate);
  }

  candidates.sort((left, right) => {
    if (left.page !== right.page) return left.page - right.page;
    if (left.fieldBox.y !== right.fieldBox.y) {
      return left.fieldBox.y - right.fieldBox.y;
    }
    return left.fieldBox.x - right.fieldBox.x;
  });

  return {
    schemaVersion: 1,
    engine,
    pageCount,
    candidates,
  };
}

export function confidenceBand(
  confidence: number,
): "high" | "review" | "low" {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "review";
  return "low";
}

export function buildDetectedAnnotations(options: {
  candidates: DetectedFieldCandidate[];
  annotations: TemplateAnnotation[];
  pageOrder: Array<{ sourcePage: number }>;
  recipientRoleId?: string;
  idFactory?: () => string;
}): {
  annotations: TemplateAnnotation[];
  addedIds: string[];
  skippedCount: number;
} {
  const {
    candidates,
    annotations,
    pageOrder,
    recipientRoleId,
    idFactory = () => crypto.randomUUID(),
  } = options;
  const next = annotations.map((annotation) => ({ ...annotation }));
  const addedIds: string[] = [];
  let skippedCount = 0;
  let tabIndex = next.reduce(
    (maximum, annotation) =>
      Math.max(
        maximum,
        typeof annotation.tabIndex === "number" ? annotation.tabIndex : 0,
      ),
    0,
  );

  for (const candidate of candidates) {
    const pageIndex = pageOrder.findIndex(
      (entry) => entry.sourcePage === candidate.page,
    );
    if (pageIndex < 0) {
      skippedCount += 1;
      continue;
    }

    const id = idFactory();
    tabIndex += 1;
    const assignableFields = next.filter((annotation) =>
      typeof annotation.fieldKey === "string" ||
      typeof annotation.recipientRoleId === "string",
    );
    const fieldKey = createUniqueDetectionFieldKey(
      candidate.suggestedKey,
      assignableFields,
    );
    const annotation = candidateToAnnotation({
      candidate,
      id,
      page: pageIndex + 1,
      fieldKey,
      tabIndex,
      recipientRoleId,
      idFactory,
    });
    next.push(annotation);
    addedIds.push(id);
  }

  return { annotations: next, addedIds, skippedCount };
}

export function evaluateFieldDetection(options: {
  expected: DetectionEvaluationField[];
  predicted: DetectionEvaluationField[];
}): DetectionEvaluation {
  const { expected, predicted } = options;
  const possibleMatches = predicted.flatMap((prediction, predictionIndex) =>
    expected.flatMap((expectation, expectedIndex) => {
      if (prediction.page !== expectation.page) return [];
      const fieldIou = rectIou(prediction.fieldBox, expectation.fieldBox);
      const labelScore = labelSimilarity(prediction.label, expectation.label);
      if (fieldIou < 0.2 && labelScore < 0.8) return [];
      return [{ predictionIndex, expectedIndex, score: fieldIou + labelScore }];
    }),
  );
  possibleMatches.sort((left, right) => right.score - left.score);

  const matchedPredictions = new Set<number>();
  const matchedExpectations = new Set<number>();
  const matches: Array<{ predicted: DetectionEvaluationField; expected: DetectionEvaluationField }> = [];
  for (const match of possibleMatches) {
    if (
      matchedPredictions.has(match.predictionIndex) ||
      matchedExpectations.has(match.expectedIndex)
    ) {
      continue;
    }
    matchedPredictions.add(match.predictionIndex);
    matchedExpectations.add(match.expectedIndex);
    matches.push({
      predicted: predicted[match.predictionIndex],
      expected: expected[match.expectedIndex],
    });
  }

  const precision = ratio(matches.length, predicted.length);
  const recall = ratio(matches.length, expected.length);
  return {
    expectedCount: expected.length,
    predictedCount: predicted.length,
    matchedCount: matches.length,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    labelAccuracy: ratio(
      matches.filter(
        (match) =>
          labelSimilarity(match.predicted.label, match.expected.label) >= 0.8,
      ).length,
      matches.length,
    ),
    toolAccuracy: ratio(
      matches.filter((match) => match.predicted.tool === match.expected.tool)
        .length,
      matches.length,
    ),
    meanFieldIou: average(
      matches.map((match) =>
        rectIou(match.predicted.fieldBox, match.expected.fieldBox),
      ),
    ),
    usablePositionRate: ratio(
      matches.filter(
        (match) =>
          rectIou(match.predicted.fieldBox, match.expected.fieldBox) >= 0.5,
      ).length,
      matches.length,
    ),
  };
}

export function rectIou(left: NormalizedRect, right: NormalizedRect): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union =
    left.width * left.height + right.width * right.height - intersection;
  return union > 0 ? Math.min(1, intersection / union) : 0;
}

function createUniqueDetectionFieldKey(
  value: string,
  annotations: TemplateAnnotation[],
): string {
  const numbered = value.match(/^(.*)_([2-9]\d*)$/u);
  if (!numbered) return createUniqueFieldKey(value, annotations);
  const existingKeys = new Set(annotations.map(annotationFieldKey));
  const semanticBase = numbered[1];
  return existingKeys.has(semanticBase)
    ? createUniqueFieldKey(semanticBase, annotations)
    : createUniqueFieldKey(value, annotations);
}

function normalizeCandidate(options: {
  value: unknown;
  pageCount: number;
  idFactory: () => string;
}): DetectedFieldCandidate | null {
  const { value, pageCount, idFactory } = options;
  const candidate = objectValue(value);
  if (!candidate) return null;
  const label = stringValue(candidate.label).slice(0, 120);
  const page = integerValue(candidate.page);
  const tool = stringValue(candidate.tool);
  const labelBox = normalizeRect(candidate.labelBox);
  const fieldBox = normalizeRect(candidate.fieldBox);
  if (
    !label ||
    page < 1 ||
    page > pageCount ||
    !TOOL_SET.has(tool) ||
    !labelBox ||
    !fieldBox
  ) {
    return null;
  }

  const validationValue = stringValue(candidate.validation);
  const validation = VALIDATIONS.has(validationValue as AiFieldValidation)
    ? (validationValue as AiFieldValidation)
    : "none";
  const selectableOptions = Array.isArray(candidate.options)
    ? uniqueStrings(candidate.options).slice(0, 30)
    : [];
  const normalizedTool = tool === "dropdown" && selectableOptions.length < 2
    ? "input"
    : (tool as AiFieldTool);

  return {
    candidateId: idFactory(),
    page,
    label,
    suggestedKey: createFieldKey(
      stringValue(candidate.suggestedKey) || label,
    ),
    tool: normalizedTool,
    validation: normalizedTool === "input" ? validation : "none",
    labelBox,
    fieldBox,
    required: candidate.required === true,
    confidence: clamp(numberValue(candidate.confidence), 0, 1),
    evidence: stringValue(candidate.evidence).slice(0, 240),
    options: normalizedTool === "dropdown" ? selectableOptions : [],
  };
}

function candidateToAnnotation(options: {
  candidate: DetectedFieldCandidate;
  id: string;
  page: number;
  fieldKey: string;
  tabIndex: number;
  recipientRoleId?: string;
  idFactory: () => string;
}): TemplateAnnotation {
  const {
    candidate,
    id,
    page,
    fieldKey,
    tabIndex,
    recipientRoleId,
    idFactory,
  } = options;
  const annotation: TemplateAnnotation = {
    id,
    page,
    type: candidate.tool,
    ...candidate.fieldBox,
    color: "#0f172a",
    borderColor: "#cbd5e1",
    fieldName: candidate.label,
    fieldKey,
    placeholder: candidate.tool === "textarea" ? "Enter paragraph" : "Enter value",
    required: candidate.required,
    validation: candidate.tool === "input" ? candidate.validation : "none",
    tabIndex,
    recipientRoleId,
    aiDetection: {
      candidateId: candidate.candidateId,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      schemaVersion: 1,
    },
    labelBinding: {
      text: candidate.label,
      sourceText: candidate.label,
      page,
      rect: candidate.labelBox,
      source: "ai-detection",
    },
  };
  if (candidate.tool === "textarea") annotation.multiline = true;
  if (candidate.tool === "checkbox") annotation.checked = false;
  if (candidate.tool === "dropdown") {
    annotation.options = candidate.options.map((label) => ({
      id: idFactory(),
      label,
      checked: false,
    }));
  }
  return annotation;
}

function normalizeRect(value: unknown): NormalizedRect | null {
  const rect = objectValue(value);
  if (!rect) return null;
  const rawX = numberValue(rect.x);
  const rawY = numberValue(rect.y);
  const rawWidth = numberValue(rect.width);
  const rawHeight = numberValue(rect.height);
  if (
    ![rawX, rawY, rawWidth, rawHeight].every(Number.isFinite) ||
    rawWidth <= 0 ||
    rawHeight <= 0
  ) {
    return null;
  }
  const x = clamp(rawX, 0, 0.995);
  const y = clamp(rawY, 0, 0.995);
  return {
    x,
    y,
    width: clamp(rawWidth, 0.005, 1 - x),
    height: clamp(rawHeight, 0.005, 1 - y),
  };
}

function uniqueKey(value: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(value)) return value;
  for (let index = 2; index <= usedKeys.size + 2; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${value.slice(0, 64 - suffix.length)}${suffix}`;
    if (!usedKeys.has(candidate)) return candidate;
  }
  return createFieldKey(`field_${usedKeys.size + 1}`);
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function integerValue(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : -1;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const text = stringValue(value).slice(0, 100);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}
