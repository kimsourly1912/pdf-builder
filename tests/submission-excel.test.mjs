import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => vite.close());

const excel = await vite.ssrLoadModule(
  "/features/templates/submission-excel.ts",
);

const annotation = (overrides = {}) => ({
  id: "field-1",
  page: 1,
  type: "input",
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.05,
  color: "#475569",
  ...overrides,
});

test("formats submission values for a readable Excel export", () => {
  const annotations = [
    annotation({
      id: "department",
      type: "dropdown",
      options: [{ id: "engineering", label: "Engineering" }],
    }),
  ];
  assert.equal(
    excel.formatSubmissionExportValue(
      {
        fieldId: "department",
        key: "department",
        label: "Department",
        type: "dropdown",
        value: "engineering",
      },
      annotations,
    ),
    "Engineering",
  );
  assert.equal(
    excel.formatSubmissionExportValue(
      {
        fieldId: "active",
        key: "active",
        label: "Active",
        type: "checkbox",
        value: true,
      },
      annotations,
    ),
    "Yes",
  );
});

test("creates a valid XLSX package with Khmer and formula-like text as values", () => {
  const bytes = excel.createSubmissionExcelWorkbook(
    {
      templateName: "Employee details",
      versionNumber: 2,
      roleName: "Recipient",
      recipientName: "គឹម សួរ",
      recipientEmail: "recipient@example.com",
      submittedAt: "2026-09-09T01:00:00.000Z",
      annotations: [annotation()],
      answers: [
        {
          fieldId: "field-1",
          key: "comment",
          label: "Comment & notes",
          type: "textarea",
          value: '=HYPERLINK("https://example.com") <safe>',
        },
      ],
    },
    new Date("2026-09-09T01:00:00.000Z"),
  );
  const entries = readStoredZip(bytes);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.ok(entries.has("[Content_Types].xml"));
  assert.ok(entries.has("xl/workbook.xml"));
  assert.ok(entries.has("xl/styles.xml"));
  assert.ok(entries.has("xl/worksheets/sheet1.xml"));

  const sheetXml = new TextDecoder().decode(
    entries.get("xl/worksheets/sheet1.xml"),
  );
  assert.match(sheetXml, /គឹម សួរ/u);
  assert.match(sheetXml, /Engineering|Comment &amp; notes/u);
  assert.match(sheetXml, /=HYPERLINK\(&quot;https:\/\/example.com&quot;\) &lt;safe&gt;/u);
  assert.doesNotMatch(sheetXml, /<f>/u);
});

test("uses a safe and predictable Excel filename", () => {
  assert.equal(
    excel.submissionExcelFileName("Employee / Personal Details"),
    "Employee-Personal-Details-submission.xlsx",
  );
});

function readStoredZip(bytes) {
  const entries = new Map();
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const compression = view.getUint16(8, true);
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    assert.equal(compression, 0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}
