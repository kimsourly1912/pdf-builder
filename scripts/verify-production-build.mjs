import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const DIST_DIRECTORY = "dist";
const FORBIDDEN_MARKERS = [
  "pdf-builder-dev",
  "pdf-builder-ai-field-detection-dev",
  "http://localhost:5173",
  '"ENVIRONMENT":"development"',
];
const REQUIRED_MARKERS = [
  "pdf-builder-ai-field-detection",
  "https://pdf-builder.kimsur61.workers.dev",
];

if (!existsSync(DIST_DIRECTORY)) {
  throw new Error("Production verification requires a completed dist build.");
}

const content = collectText(DIST_DIRECTORY);
for (const marker of FORBIDDEN_MARKERS) {
  if (content.includes(marker)) {
    throw new Error(`Production output contains development marker: ${marker}`);
  }
}
for (const marker of REQUIRED_MARKERS) {
  if (!content.includes(marker)) {
    throw new Error(`Production output is missing required marker: ${marker}`);
  }
}
console.log("Verified production bindings in compiled output.");

function collectText(directory) {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return collectText(path);
      if (!/\.(js|json|mjs|txt)$/u.test(path)) return [];
      return [readFileSync(path, "utf8")];
    })
    .join("\n");
}
