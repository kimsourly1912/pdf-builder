import {
  bulkSubmissionFileName,
  createBulkSubmissionsCsv,
  createBulkSubmissionsExcelWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/features/templates/submission-excel";
import { normalizeTimeZone } from "@/features/templates/date-time";
import { parseSubmissionFilters } from "@/features/templates/submission-filters";
import { queryOwnedSubmissions } from "@/features/templates/submission-query.server";
import {
  isResponse,
  jsonError,
  requireRequestOwner,
} from "@/features/templates/template.server";

const MAX_EXPORT_ROWS = 10_000;

export async function GET(request: Request) {
  try {
    const ownerEmail = await requireRequestOwner(request);
    const url = new URL(request.url);
    const parsed = parseSubmissionFilters(url.searchParams);
    if (!parsed.filters) return jsonError(parsed.error, 400);
    if (!parsed.filters.templateId) {
      return jsonError("Choose a template before exporting submissions.", 400);
    }
    const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    const timeZone = normalizeTimeZone(url.searchParams.get("timeZone"));
    const result = await queryOwnedSubmissions(
      ownerEmail,
      parsed.filters,
      MAX_EXPORT_ROWS + 1,
    );
    if (result.total === 0 || result.rows.length === 0) {
      return jsonError("No submissions match these filters.", 404);
    }
    if (result.total > MAX_EXPORT_ROWS) {
      return jsonError(
        `This export has more than ${MAX_EXPORT_ROWS.toLocaleString("en-US")} rows. Narrow the filters and try again.`,
        422,
      );
    }

    const templateName = result.rows[0].templateName;
    const data = {
      templateName,
      timeZone,
      rows: result.rows.map((row) => ({
        id: row.id,
        templateName: row.templateName,
        versionNumber: row.versionNumber,
        roleName: row.roleName,
        recipientName: row.recipientName,
        recipientEmail: row.recipientEmail,
        submittedAt: row.submittedAt,
        answers: row.answers,
        annotations: row.annotations,
      })),
    };
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${bulkSubmissionFileName(templateName, format)}"`,
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : XLSX_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
    };
    if (format === "csv") {
      return new Response(createBulkSubmissionsCsv(data), { headers });
    }
    const workbook = createBulkSubmissionsExcelWorkbook(data);
    return new Response(workbook.buffer as ArrayBuffer, { headers });
  } catch (error) {
    if (isResponse(error)) return error;
    console.error("Failed to export submissions", error);
    return jsonError("The submissions export could not be created.", 500);
  }
}
