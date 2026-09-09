import { formatCambodiaAddress } from "@/features/gazetteer/gazetteer";
import {
  normalizeTimeZone,
  parseUtcTimestamp,
} from "@/features/templates/date-time";
import { isStoredSubmissionImage } from "@/features/templates/file-validation";
import type { SubmissionAnswer } from "@/features/templates/label-binding";
import type { TemplateAnnotation } from "@/features/templates/template.types";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_CELL_CHARACTERS = 32_767;

type SubmissionExcelData = {
  templateName: string;
  versionNumber: number;
  roleName: string;
  recipientName: string;
  recipientEmail: string;
  submittedAt: string;
  timeZone: string;
  answers: SubmissionAnswer[];
  annotations: TemplateAnnotation[];
};

export type BulkSubmissionExcelRow = {
  id: string;
  templateName: string;
  versionNumber: number;
  roleName: string;
  recipientName: string;
  recipientEmail: string;
  submittedAt: string;
  answers: SubmissionAnswer[];
  annotations: TemplateAnnotation[];
};

type BulkSubmissionExcelData = {
  templateName: string;
  timeZone: string;
  rows: BulkSubmissionExcelRow[];
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

export { XLSX_CONTENT_TYPE };

export function createSubmissionExcelWorkbook(
  data: SubmissionExcelData,
  createdAt = new Date(),
) {
  const entries = workbookEntries(data, createdAt);
  return createStoredZip(entries, createdAt);
}

export function createBulkSubmissionsExcelWorkbook(
  data: BulkSubmissionExcelData,
  createdAt = new Date(),
) {
  return createStoredZip(
    workbookPackageEntries(
      bulkWorksheetXml(data, createdAt),
      "Submissions",
      `${data.templateName} submissions`,
      createdAt,
    ),
    createdAt,
  );
}

export function createBulkSubmissionsCsv(data: BulkSubmissionExcelData) {
  const columns = bulkAnswerColumns(data.rows);
  const headers = [
    "Submitted at",
    "Template",
    "Recipient",
    "Email",
    "Role",
    "Template version",
    "Submission ID",
    ...columns.map((column) => column.header),
  ];
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(data.timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const rows = data.rows.map((row) => {
    const answers = new Map(row.answers.map((answer) => [answer.key, answer]));
    const submittedAt = parseUtcTimestamp(row.submittedAt);
    return [
      submittedAt ? formatter.format(submittedAt) : row.submittedAt,
      row.templateName,
      row.recipientName,
      row.recipientEmail,
      row.roleName,
      String(row.versionNumber),
      row.id,
      ...columns.map((column) => {
        const answer = answers.get(column.key);
        return answer ? formatSubmissionExportValue(answer, row.annotations) : "";
      }),
    ];
  });
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

export function formatSubmissionExportValue(
  answer: SubmissionAnswer,
  annotations: TemplateAnnotation[],
) {
  const value = answer.value;
  if (isStoredSubmissionImage(value)) {
    const size = formatFileSize(value.size);
    return `Image uploaded (${value.width} × ${value.height}, ${size})`;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "province" in value) {
    return formatCambodiaAddress(value, "bilingual");
  }

  const annotation = annotations.find((item) => item.id === answer.fieldId);
  const optionLabels = new Map(
    parseOptions(annotation?.options).map((option) => [option.id, option.label]),
  );
  if (Array.isArray(value)) {
    return value
      .map((item) => optionLabels.get(String(item)) ?? String(item))
      .join(", ");
  }
  if (typeof value === "string" && optionLabels.has(value)) {
    return optionLabels.get(value) ?? value;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

export function submissionExcelFileName(templateName: string) {
  return `${safeExportName(templateName, "submission")}-submission.xlsx`;
}

export function bulkSubmissionFileName(
  templateName: string,
  format: "xlsx" | "csv",
) {
  return `${safeExportName(templateName, "submissions")}-submissions.${format}`;
}

function safeExportName(templateName: string, fallback: string) {
  const safeName = templateName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return safeName || fallback;
}

function workbookEntries(data: SubmissionExcelData, createdAt: Date) {
  return workbookPackageEntries(
    worksheetXml(data),
    "Submission",
    `${data.templateName} submission`,
    createdAt,
  );
}

function workbookPackageEntries(
  sheetXml: string,
  sheetName: string,
  title: string,
  createdAt: Date,
) {
  return [
    textEntry("[Content_Types].xml", contentTypesXml()),
    textEntry("_rels/.rels", rootRelationshipsXml()),
    textEntry("docProps/app.xml", appPropertiesXml(sheetName)),
    textEntry("docProps/core.xml", corePropertiesXml(createdAt, title)),
    textEntry("xl/workbook.xml", workbookXml(sheetName)),
    textEntry("xl/_rels/workbook.xml.rels", workbookRelationshipsXml()),
    textEntry("xl/styles.xml", stylesXml()),
    {
      name: "xl/worksheets/sheet1.xml",
      data: new TextEncoder().encode(sheetXml),
    },
  ];
}

function textEntry(name: string, value: string): ZipEntry {
  return { name, data: new TextEncoder().encode(value) };
}

function contentTypesXml() {
  return xml(`
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
}

function rootRelationshipsXml() {
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function appPropertiesXml(sheetName: string) {
  return xml(`
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>PDF Studio</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapeXml(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`);
}

function corePropertiesXml(createdAt: Date, title: string) {
  const timestamp = createdAt.toISOString();
  return xml(`
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>PDF Studio</dc:creator>
  <cp:lastModifiedBy>PDF Studio</cp:lastModifiedBy>
  <dc:title>${escapeXml(title)}</dc:title>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`);
}

function workbookXml(sheetName: string) {
  return xml(`
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <workbookPr date1904="0"/>
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
  <sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
  <calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`);
}

function workbookRelationshipsXml() {
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function stylesXml() {
  return xml(`
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
  <fonts count="4">
    <font><sz val="10"/><color rgb="FF334155"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF334155"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FF0F172A"/><name val="Aptos Display"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF475569"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`);
}

function worksheetXml(data: SubmissionExcelData) {
  const submittedAt = parseUtcTimestamp(data.submittedAt);
  const timeZone = normalizeTimeZone(data.timeZone);
  const answerRows = data.answers.map((answer, index) => {
    const rowNumber = index + 11;
    const value = formatSubmissionExportValue(answer, data.annotations);
    return `<row r="${rowNumber}">${inlineStringCell(`A${rowNumber}`, answer.label, 4)}${inlineStringCell(`B${rowNumber}`, value, 4)}${inlineStringCell(`C${rowNumber}`, answer.key, 4)}${inlineStringCell(`D${rowNumber}`, answer.type, 4)}</row>`;
  });
  const lastRow = Math.max(11, data.answers.length + 10);
  const submittedAtCell = submittedAt
    ? numberCell("B7", excelDateSerial(submittedAt, timeZone), 6)
    : inlineStringCell("B7", data.submittedAt, 5);

  return xml(`
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="10" topLeftCell="A11" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A11" sqref="A11"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="64" customWidth="1"/><col min="3" max="3" width="28" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${inlineStringCell("A1", `${data.templateName} submission`, 1)}</row>
    ${metadataRow(3, "Recipient", data.recipientName)}
    ${metadataRow(4, "Email", data.recipientEmail)}
    ${metadataRow(5, "Recipient role", data.roleName)}
    <row r="6">${inlineStringCell("A6", "Template version", 2)}${numberCell("B6", data.versionNumber, 5)}</row>
    <row r="7">${inlineStringCell("A7", "Submitted at", 2)}${submittedAtCell}</row>
    ${metadataRow(8, "Timezone", timeZone)}
    <row r="10" ht="22" customHeight="1">${inlineStringCell("A10", "Field", 3)}${inlineStringCell("B10", "Value", 3)}${inlineStringCell("C10", "Field key", 3)}${inlineStringCell("D10", "Field type", 3)}</row>
    ${answerRows.join("\n    ")}
  </sheetData>
  <autoFilter ref="A10:D${lastRow}"/>
  <mergeCells count="1"><mergeCell ref="A1:D1"/></mergeCells>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`);
}

function bulkWorksheetXml(data: BulkSubmissionExcelData, createdAt: Date) {
  const timeZone = normalizeTimeZone(data.timeZone);
  const columns = bulkAnswerColumns(data.rows);
  const headers = [
    "Submitted at",
    "Template",
    "Recipient",
    "Email",
    "Role",
    "Template version",
    "Submission ID",
    ...columns.map((column) => column.header),
  ];
  const lastColumn = columnName(headers.length);
  const headerRow = headers
    .map((header, index) => inlineStringCell(`${columnName(index + 1)}4`, header, 3))
    .join("");
  const submissionRows = data.rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 5;
    const answers = new Map(row.answers.map((answer) => [answer.key, answer]));
    const submittedAt = parseUtcTimestamp(row.submittedAt);
    const cells = [
      submittedAt
        ? numberCell(`A${rowNumber}`, excelDateSerial(submittedAt, timeZone), 6)
        : inlineStringCell(`A${rowNumber}`, row.submittedAt, 5),
      inlineStringCell(`B${rowNumber}`, row.templateName, 5),
      inlineStringCell(`C${rowNumber}`, row.recipientName, 5),
      inlineStringCell(`D${rowNumber}`, row.recipientEmail, 5),
      inlineStringCell(`E${rowNumber}`, row.roleName, 5),
      numberCell(`F${rowNumber}`, row.versionNumber, 5),
      inlineStringCell(`G${rowNumber}`, row.id, 5),
      ...columns.map((column, index) => {
        const answer = answers.get(column.key);
        const value = answer
          ? formatSubmissionExportValue(answer, row.annotations)
          : "";
        return inlineStringCell(`${columnName(index + 8)}${rowNumber}`, value, 4);
      }),
    ];
    return `<row r="${rowNumber}">${cells.join("")}</row>`;
  });
  const lastRow = Math.max(5, data.rows.length + 4);
  const exportTime = excelDateSerial(createdAt, timeZone);
  return xml(`
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="5" width="22" customWidth="1"/><col min="6" max="6" width="16" customWidth="1"/><col min="7" max="7" width="38" customWidth="1"/><col min="8" max="${headers.length}" width="28" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${inlineStringCell("A1", `${data.templateName} submissions`, 1)}</row>
    <row r="2">${inlineStringCell("A2", `Timezone: ${timeZone}`, 0)}${inlineStringCell("D2", "Exported at", 2)}${numberCell("E2", exportTime, 6)}</row>
    <row r="4" ht="22" customHeight="1">${headerRow}</row>
    ${submissionRows.join("\n    ")}
  </sheetData>
  <autoFilter ref="A4:${lastColumn}${lastRow}"/>
  <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:B2"/></mergeCells>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`);
}

function bulkAnswerColumns(rows: BulkSubmissionExcelRow[]) {
  const labelsByKey = new Map<string, string>();
  const labelCounts = new Map<string, number>();
  for (const row of rows) {
    for (const answer of row.answers) {
      if (!labelsByKey.has(answer.key)) labelsByKey.set(answer.key, answer.label);
    }
  }
  for (const label of labelsByKey.values()) {
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return [...labelsByKey].map(([key, label]) => ({
    key,
    header: labelCounts.get(label) === 1 ? label : `${label} (${key})`,
  }));
}

function columnName(index: number) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function csvCell(value: string) {
  const clean = excelText(value);
  const safe = /^[=+\-@]/u.test(clean) ? `'${clean}` : clean;
  return `"${safe.replaceAll('"', '""')}"`;
}

function metadataRow(rowNumber: number, label: string, value: string) {
  return `<row r="${rowNumber}">${inlineStringCell(`A${rowNumber}`, label, 2)}${inlineStringCell(`B${rowNumber}`, value, 5)}</row>`;
}

function inlineStringCell(reference: string, value: string, style: number) {
  const text = excelText(value);
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function numberCell(reference: string, value: number, style: number) {
  return `<c r="${reference}" s="${style}" t="n"><v>${value}</v></c>`;
}

function excelText(value: string) {
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, "");
  const truncated = clean.slice(0, MAX_CELL_CHARACTERS);
  return /[\uD800-\uDBFF]$/u.test(truncated) ? truncated.slice(0, -1) : truncated;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function excelDateSerial(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    ) /
      86_400_000 +
    25_569
  );
}

function xml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body.trim()}`;
}

function parseOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || Array.isArray(item) || typeof item !== "object") return [];
    const option = item as Record<string, unknown>;
    return typeof option.id === "string" && typeof option.label === "string"
      ? [{ id: option.id, label: option.label }]
      : [];
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function createStoredZip(entries: ZipEntry[], createdAt: Date) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const { time, date } = dosDateTime(createdAt);
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(name, 30);
    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = concatenate(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.length, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);
  return concatenate([...localParts, centralDirectory, end]);
}

function concatenate(parts: Uint8Array[]) {
  const total = parts.reduce((length, part) => length + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dosDateTime(value: Date) {
  const year = Math.min(2107, Math.max(1980, value.getUTCFullYear()));
  const time =
    (value.getUTCHours() << 11) |
    (value.getUTCMinutes() << 5) |
    Math.floor(value.getUTCSeconds() / 2);
  const date =
    ((year - 1980) << 9) |
    ((value.getUTCMonth() + 1) << 5) |
    value.getUTCDate();
  return { time, date };
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
