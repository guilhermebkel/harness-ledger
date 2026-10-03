#!/usr/bin/env node
import { readFileSync } from "node:fs";

const USAGE = "Usage: node scripts/compare-analyses.mjs <before.json> <after.json>";
const MAX_SHOWN_CHARS = 160;
const MAX_DIFFERENCES = 50;
const FIRST_ARGUMENT_INDEX = 2;
const USAGE_ERROR_EXIT_CODE = 2;
// Why: these change on every run (clock, where the data lives), so they are never a difference in the analysis.
const RUN_FIELDS = new Set(["generatedAt", "period.until", "dataDir"]);

function readAnalysis(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function shown(value) {
  return (JSON.stringify(value) ?? "undefined").slice(0, MAX_SHOWN_CHARS);
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function differencesOf(before, after, path, differences) {
  if (RUN_FIELDS.has(path) || JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  if (!isObject(before) || !isObject(after)) {
    differences.push(`${path || "(root)"}: ${shown(before)} => ${shown(after)}`);
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    differencesOf(before[key], after[key], path ? `${path}.${key}` : key, differences);
  }
}

const [beforePath, afterPath] = process.argv.slice(FIRST_ARGUMENT_INDEX);
if (!beforePath || !afterPath) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(USAGE_ERROR_EXIT_CODE);
}
const differences = [];
differencesOf(readAnalysis(beforePath), readAnalysis(afterPath), "", differences);
process.stdout.write(differences.length
  ? `${differences.length} differences:\n${differences.slice(0, MAX_DIFFERENCES).join("\n")}\n`
  : "Identical, apart from the run's own fields.\n");
process.exitCode = differences.length ? 1 : 0;
