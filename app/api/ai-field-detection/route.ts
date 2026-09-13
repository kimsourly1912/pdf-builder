import {
  FieldDetectionProviderError,
  detectPdfFieldsWithOpenAi,
} from "@/features/ai-field-detection/openai-field-detection.server";
import { inspectPdf } from "@/features/templates/file-validation";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

const MAX_EVALUATION_PDF_SIZE = 12 * 1024 * 1024;
const MAX_EVALUATION_PAGE_COUNT = 20;

export async function POST(request: Request) {
  try {
    await requireRequestOwner(request);
    const formData = await request.formData();
    const pdf = formData.get("pdf");
    if (!(pdf instanceof File) || pdf.type !== "application/pdf") {
      return jsonError("A PDF file is required.", 400);
    }
    if (pdf.size > MAX_EVALUATION_PDF_SIZE) {
      return jsonError(
        "Phase 1 AI analysis supports PDFs up to 12 MB.",
        413,
      );
    }

    const bytes = new Uint8Array(
      await pdf.arrayBuffer(),
    ) as Uint8Array<ArrayBuffer>;
    const inspection = await inspectPdf(bytes);
    if (!inspection) {
      return jsonError("The uploaded file is not a valid PDF.", 400);
    }
    if (inspection.pageCount > MAX_EVALUATION_PAGE_COUNT) {
      return jsonError(
        `Phase 1 AI analysis supports up to ${MAX_EVALUATION_PAGE_COUNT} pages.`,
        413,
      );
    }

    const detection = await detectPdfFieldsWithOpenAi({
      bytes,
      fileName: pdf.name || "document.pdf",
      pageCount: inspection.pageCount,
    });
    return Response.json({ detection });
  } catch (error) {
    if (isResponse(error)) return error;
    if (error instanceof FieldDetectionProviderError) {
      console.error("AI field detection provider failed", error.message);
      return jsonError(error.publicMessage, error.status);
    }
    console.error("AI field detection failed", error);
    return jsonError("The PDF could not be analyzed.", 500);
  }
}
