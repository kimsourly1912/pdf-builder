import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const datasetPath = resolve(
  process.cwd(),
  process.argv[2] || "evaluation/ai-field-detection.json",
);
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) {
  throw new Error("The evaluation dataset must contain at least one case.");
}

const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

try {
  const detection = await vite.ssrLoadModule(
    "/features/ai-field-detection/field-detection.ts",
  );
  const results = dataset.cases.map((entry) => ({
    id: entry.id,
    ...detection.evaluateFieldDetection({
      expected: entry.expected,
      predicted: entry.predicted,
    }),
  }));
  const metricNames = [
    "precision",
    "recall",
    "f1",
    "labelAccuracy",
    "toolAccuracy",
    "meanFieldIou",
    "usablePositionRate",
  ];
  const summary = Object.fromEntries(
    metricNames.map((metric) => [
      metric,
      results.reduce((total, result) => total + result[metric], 0) /
        results.length,
    ]),
  );

  console.table(
    results.map((result) => ({
      document: result.id,
      expected: result.expectedCount,
      predicted: result.predictedCount,
      matched: result.matchedCount,
      precision: percent(result.precision),
      recall: percent(result.recall),
      tools: percent(result.toolAccuracy),
      position: percent(result.usablePositionRate),
    })),
  );
  console.log("Average metrics", {
    precision: percent(summary.precision),
    recall: percent(summary.recall),
    f1: percent(summary.f1),
    labelAccuracy: percent(summary.labelAccuracy),
    toolAccuracy: percent(summary.toolAccuracy),
    meanFieldIou: percent(summary.meanFieldIou),
    usablePositionRate: percent(summary.usablePositionRate),
  });

  const passes =
    summary.recall >= 0.9 &&
    summary.toolAccuracy >= 0.85 &&
    summary.usablePositionRate >= 0.8;
  if (!passes) process.exitCode = 1;
} finally {
  await vite.close();
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

