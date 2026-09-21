import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const datasetPath = resolve(
  process.cwd(),
  process.argv[2] || "evaluation/resume-extraction.json",
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
  const profiles = await vite.ssrLoadModule(
    "/features/resumes/candidate-profile.ts",
  );
  const evaluation = await vite.ssrLoadModule(
    "/features/resumes/resume-evaluation.ts",
  );
  const results = dataset.cases.map((entry) => {
    const profile = profiles.normalizeCandidateProfile(
      entry.predicted,
      entry.pageCount,
    );
    if (!profile) throw new Error(`Invalid predicted profile for ${entry.id}.`);
    return {
      id: entry.id,
      ...evaluation.evaluateResumeProfile({
        expected: entry.expected,
        predicted: profile,
      }),
    };
  });
  const average = (key) =>
    results.reduce((total, result) => total + result[key], 0) / results.length;
  console.table(results.map((result) => ({
    resume: result.id,
    expected: result.expectedCount,
    predicted: result.predictedCount,
    matched: result.matchedCount,
    precision: percent(result.precision),
    recall: percent(result.recall),
    similarity: percent(result.meanValueSimilarity),
  })));
  console.log("Average metrics", {
    precision: percent(average("precision")),
    recall: percent(average("recall")),
    f1: percent(average("f1")),
    meanValueSimilarity: percent(average("meanValueSimilarity")),
  });
} finally {
  await vite.close();
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
