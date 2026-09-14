import {
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFString,
  PDFTextField,
} from "pdf-lib";
import type {
  PDFField,
  PDFPage,
  PDFWidgetAnnotation,
} from "pdf-lib";

import type {
  AiFieldTool,
  AiFieldValidation,
  DetectedFieldCandidate,
} from "@/features/ai-field-detection/field-detection";
import { createFieldKey } from "@/features/templates/label-binding";
import { pdfBoxToNormalizedRect } from "@/features/templates/pdf-coordinates";

export type AcroFormFieldDetection = {
  candidates: DetectedFieldCandidate[];
  totalFields: number;
  readOnlyFields: number;
  unsupportedFields: number;
};

type FieldDescriptor = {
  tool: AiFieldTool;
  validation: AiFieldValidation;
  options: string[];
};

export async function detectAcroFormFields(options: {
  bytes: Uint8Array<ArrayBuffer>;
}): Promise<AcroFormFieldDetection> {
  const { bytes } = options;
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = document.getPages();
  const pageIndexByRef = new Map(
    pages.map((page, index) => [page.ref.toString(), index]),
  );
  const fields = document.getForm().getFields();
  const candidates: DetectedFieldCandidate[] = [];
  const usedKeys = new Set<string>();
  let readOnlyFields = 0;
  let unsupportedFields = 0;

  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
    const field = fields[fieldIndex];
    if (field.isReadOnly()) {
      readOnlyFields += 1;
      continue;
    }
    const fieldName = field.getName();
    const label = fieldLabel(field, fieldName);
    const descriptor = describeField(field, `${fieldName} ${label}`);
    if (!descriptor) {
      unsupportedFields += 1;
      continue;
    }

    const widgets = field.acroField.getWidgets();
    if (widgets.length === 0) {
      unsupportedFields += 1;
      continue;
    }
    for (let widgetIndex = 0; widgetIndex < widgets.length; widgetIndex += 1) {
      const widget = widgets[widgetIndex];
      const pageIndex = findWidgetPageIndex({
        document,
        pages,
        pageIndexByRef,
        widget,
      });
      if (pageIndex < 0) {
        unsupportedFields += 1;
        continue;
      }
      const page = pages[pageIndex];
      const fieldBox = pdfBoxToNormalizedRect(
        widget.getRectangle(),
        page.getCropBox(),
        page.getRotation().angle,
      );
      if (fieldBox.width <= 0 || fieldBox.height <= 0) {
        unsupportedFields += 1;
        continue;
      }
      const baseKey = createFieldKey(
        splitFieldNameWords(fieldName),
        `field_${fieldIndex + 1}`,
      );
      const suggestedKey = uniqueKey(baseKey, usedKeys);
      usedKeys.add(suggestedKey);
      const genericLabel = isGenericFieldLabel(label);
      candidates.push({
        candidateId: `acroform:${fieldIndex + 1}:${widgetIndex + 1}:${pageIndex + 1}`,
        source: "acroform",
        page: pageIndex + 1,
        label,
        suggestedKey,
        tool: descriptor.tool,
        validation: descriptor.validation,
        labelBox: { ...fieldBox },
        fieldBox,
        required: field.isRequired(),
        confidence: genericLabel ? 0.86 : 0.98,
        evidence: `Embedded AcroForm ${field.constructor.name} widget named “${fieldName}”.`,
        options: descriptor.options,
      });
    }
  }

  candidates.sort(compareCandidatePosition);
  return {
    candidates,
    totalFields: fields.length,
    readOnlyFields,
    unsupportedFields,
  };
}

function describeField(field: PDFField, searchableName: string): FieldDescriptor | null {
  if (field instanceof PDFTextField) {
    if (field.isMultiline()) {
      return { tool: "textarea", validation: "none", options: [] };
    }
    if (isDateField(searchableName)) {
      return { tool: "date", validation: "none", options: [] };
    }
    return {
      tool: "input",
      validation: inferValidation(searchableName),
      options: [],
    };
  }
  if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
    const options = uniqueOptions(field.getOptions());
    return options.length >= 2
      ? { tool: "dropdown", validation: "none", options }
      : { tool: "input", validation: "none", options: [] };
  }
  if (field instanceof PDFCheckBox) {
    return { tool: "checkbox", validation: "none", options: [] };
  }
  return null;
}

function fieldLabel(field: PDFField, fieldName: string): string {
  const tooltip = field.acroField.dict.lookupMaybe(
    PDFName.of("TU"),
    PDFString,
    PDFHexString,
  );
  const source = tooltip?.decodeText().trim() || fieldName.split(".").at(-1) || fieldName;
  return splitFieldNameWords(source)
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
}

function splitFieldNameWords(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/gu, "$1 $2");
}

function findWidgetPageIndex(options: {
  document: PDFDocument;
  pages: PDFPage[];
  pageIndexByRef: Map<string, number>;
  widget: PDFWidgetAnnotation;
}): number {
  const { document, pages, pageIndexByRef, widget } = options;
  const pageRef = widget.P();
  if (pageRef) return pageIndexByRef.get(pageRef.toString()) ?? -1;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const annotations = pages[pageIndex].node.Annots()?.asArray() ?? [];
    if (
      annotations.some(
        (annotation) =>
          document.context.lookup(annotation, PDFDict) === widget.dict,
      )
    ) {
      return pageIndex;
    }
  }
  return -1;
}

function inferValidation(value: string): AiFieldValidation {
  const normalized = value.toLocaleLowerCase();
  if (/\b(e-?mail)\b/u.test(normalized)) return "email";
  if (/\b(phone|mobile|telephone|tel)\b/u.test(normalized)) return "phone";
  if (/\b(amount|number|quantity|count|total|age)\b/u.test(normalized)) {
    return "number";
  }
  return "none";
}

function isDateField(value: string): boolean {
  return /\b(date|dob|birth[ _-]?date)\b/iu.test(value);
}

function isGenericFieldLabel(value: string): boolean {
  return /^(field|text|input|choice|checkbox|dropdown|untitled)\s*\d*$/iu.test(
    value,
  );
}

function uniqueOptions(values: string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const trimmed = value.trim().slice(0, 100);
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  }).slice(0, 30);
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
