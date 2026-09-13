import "server-only";

import { env } from "cloudflare:workers";

import {
  AI_FIELD_TOOLS,
  normalizeFieldDetectionResult,
} from "@/features/ai-field-detection/field-detection";
import type { FieldDetectionResult } from "@/features/ai-field-detection/field-detection";

type OpenAiRuntime = {
  OPENAI_API_KEY?: string;
  OPENAI_FIELD_DETECTION_MODEL?: string;
};

type OpenAiResponse = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
};

export class FieldDetectionProviderError extends Error {
  readonly status: number;
  readonly publicMessage: string;

  constructor(options: {
    message: string;
    publicMessage: string;
    status: number;
  }) {
    const { message, publicMessage, status } = options;
    super(message);
    this.name = "FieldDetectionProviderError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

export async function detectPdfFieldsWithOpenAi(options: {
  bytes: Uint8Array<ArrayBuffer>;
  fileName: string;
  pageCount: number;
}): Promise<FieldDetectionResult & { providerResponseId?: string }> {
  const { bytes, fileName, pageCount } = options;
  const runtime = env as unknown as OpenAiRuntime;
  const apiKey = runtime.OPENAI_API_KEY?.trim();
  const model = runtime.OPENAI_FIELD_DETECTION_MODEL?.trim() || "gpt-5.6";
  if (!apiKey) {
    throw new FieldDetectionProviderError({
      message: "OPENAI_API_KEY is not configured.",
      publicMessage: "AI field detection is not configured yet.",
      status: 503,
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 16_000,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: FIELD_DETECTION_INSTRUCTIONS,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: safeFileName(fileName),
              file_data: `data:application/pdf;base64,${bytesToBase64(bytes)}`,
              detail: "high",
            },
            {
              type: "input_text",
              text: `Analyze this ${pageCount}-page PDF. Return only real fields that a recipient is expected to complete.`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "pdf_studio_field_detection",
          description: "Candidate recipient fields detected in a PDF form.",
          strict: true,
          schema: FIELD_DETECTION_SCHEMA,
        },
      },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new FieldDetectionProviderError({
      message: payload.error?.message || `OpenAI returned HTTP ${response.status}.`,
      publicMessage:
        response.status === 429
          ? "The AI service is busy. Wait a moment and try again."
          : "The PDF could not be analyzed by the AI service.",
      status: response.status === 429 ? 429 : 502,
    });
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new FieldDetectionProviderError({
      message: "OpenAI returned no structured output.",
      publicMessage: "The AI service returned an incomplete analysis.",
      status: 502,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new FieldDetectionProviderError({
      message: "OpenAI returned invalid JSON.",
      publicMessage: "The AI service returned an invalid analysis.",
      status: 502,
    });
  }

  const result = normalizeFieldDetectionResult({
    value: parsed,
    pageCount,
    engine: `openai:${model}`,
  });
  const usage = payload.usage
    ? {
        inputTokens: payload.usage.input_tokens ?? 0,
        outputTokens: payload.usage.output_tokens ?? 0,
        totalTokens: payload.usage.total_tokens ?? 0,
      }
    : undefined;
  return {
    ...result,
    usage,
    providerResponseId: payload.id,
  };
}

const FIELD_DETECTION_INSTRUCTIONS = `You analyze PDF forms for PDF Studio.

Find only blank fields that a recipient is expected to complete. Do not return headings, paragraphs, decorative lines, filled sample values, page numbers, or instructions.

For every field:
- page is the 1-based PDF page number.
- label is the visible human label. Preserve Khmer and other source languages.
- suggestedKey is a short English snake_case semantic key when meaning is clear. Otherwise transliterate or use field plus a meaningful suffix.
- tool must be exactly one of: ${AI_FIELD_TOOLS.join(", ")}.
- Use input for short text, email, phone, and numeric values. Set validation accordingly.
- Use textarea only for a visibly large multi-line writing area.
- Use date only for dates.
- Use checkbox only for a single independent square choice.
- Use dropdown only when visible choices are present; include at least two options.
- required is true only when the PDF explicitly marks the field as required.
- confidence measures certainty about the field meaning, tool, and position together.
- evidence briefly explains the visible evidence.
- labelBox and fieldBox are different rectangles when the label and entry area are separate.

All rectangles use normalized coordinates from 0 to 1 relative to the rendered page, with origin at the top-left: x, y, width, height. The fieldBox must cover the area where the recipient enters or selects the answer. Return no candidate rather than guessing.`;

const RECT_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
  required: ["x", "y", "width", "height"],
  additionalProperties: false,
} as const;

const FIELD_DETECTION_SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          page: { type: "integer" },
          label: { type: "string" },
          suggestedKey: { type: "string" },
          tool: { type: "string", enum: AI_FIELD_TOOLS },
          validation: {
            type: "string",
            enum: ["none", "email", "number", "phone"],
          },
          labelBox: RECT_SCHEMA,
          fieldBox: RECT_SCHEMA,
          required: { type: "boolean" },
          confidence: { type: "number" },
          evidence: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
        required: [
          "page",
          "label",
          "suggestedKey",
          "tool",
          "validation",
          "labelBox",
          "fieldBox",
          "required",
          "confidence",
          "evidence",
          "options",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["fields"],
  additionalProperties: false,
} as const;

function extractOutputText(payload: OpenAiResponse): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function safeFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/gu, "_");
  return normalized.toLowerCase().endsWith(".pdf")
    ? normalized.slice(0, 120)
    : `${normalized.slice(0, 116) || "document"}.pdf`;
}
