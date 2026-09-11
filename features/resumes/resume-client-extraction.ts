import { extractResumeProfile } from "@/features/resumes/resume-extraction";
import { MAX_RESUME_BYTES, MAX_RESUME_PAGES } from "@/features/resumes/resume.types";

export async function extractResumeFile(file: File) {
  if (file.type !== "application/pdf" || file.size === 0 || file.size > MAX_RESUME_BYTES) {
    throw new Error("Choose a PDF file up to 15 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const document = await loadingTask.promise;
  try {
    if (document.numPages > MAX_RESUME_PAGES) {
      throw new Error("Resume PDFs may contain at most 20 pages.");
    }
    const pages: Array<{ pageNumber: number; text: string }> = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ disableNormalization: false });
      let text = "";
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const needsSpace = text.length > 0 && !text.endsWith("\n") && !/^\s/u.test(item.str);
        text += `${needsSpace ? " " : ""}${item.str}`;
        if ("hasEOL" in item && item.hasEOL) text += "\n";
      }
      pages.push({ pageNumber, text: text.trim() });
    }
    return extractResumeProfile(pages);
  } finally {
    await loadingTask.destroy();
  }
}
