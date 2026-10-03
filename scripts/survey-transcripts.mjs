#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const MAX_DEPTH = 6;
const MAX_ROWS = 40;
const MAX_NAME_CHARS = 60;
const COUNT_COLUMN_WIDTH = 7;
const FIRST_ARGUMENT_INDEX = 2;

// Why: piping into `head` closes stdout early; that's not an error worth a stack trace.
process.stdout.on("error", (error) => {
  if (error.code !== "EPIPE") {
    throw error;
  }
});

async function listJsonl(folder, depth = 0) {
  if (depth > MAX_DEPTH) {
    return [];
  }
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = join(folder, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonl(entryPath, depth + 1)));
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files;
}

function increment(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function nameOf(value) {
  return String(value).slice(0, MAX_NAME_CHARS);
}

function parseRecord(line) {
  try {
    const record = JSON.parse(line);
    return record && typeof record === "object" ? record : undefined;
  } catch {
    return undefined;
  }
}

function recordLine(shape, record) {
  if (!record) {
    shape.badLines++;
    return;
  }
  const lineType = nameOf(record.type ?? "(no type)");
  increment(shape.lineTypes, lineType);
  // Why: only types, tool names and keys are recorded, never values, so the script is safe on real sessions.
  for (const key of Object.keys(record)) {
    increment(shape.lineKeys, `${lineType}.${key}`);
  }
  const subtype = record.subtype ?? record.attachment?.type ?? record.payload?.type;
  if (typeof subtype === "string") {
    increment(shape.subtypes, `${lineType}/${nameOf(subtype)}`);
  }
  recordBlocks(shape, lineType, record.message?.content ?? record.payload?.content);
  const toolResult = record.toolUseResult;
  const isToolResultObject = toolResult && typeof toolResult === "object" && !Array.isArray(toolResult);
  for (const key of isToolResultObject ? Object.keys(toolResult) : []) {
    increment(shape.toolResultKeys, key);
  }
}

function recordBlocks(shape, lineType, content) {
  const blocks = (Array.isArray(content) ? content : []).filter((block) => block && typeof block === "object");
  for (const block of blocks) {
    increment(shape.blockTypes, `${lineType}/${nameOf(block.type)}`);
    if (typeof block.name === "string") {
      increment(shape.toolNames, block.name.startsWith("mcp__") ? "mcp__*" : nameOf(block.name));
    }
  }
}

async function survey(folder) {
  const shape = {
    files: 0,
    lines: 0,
    badLines: 0,
    lineTypes: new Map(),
    lineKeys: new Map(),
    subtypes: new Map(),
    blockTypes: new Map(),
    toolNames: new Map(),
    toolResultKeys: new Map(),
  };
  for (const file of await listJsonl(folder)) {
    shape.files++;
    const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      shape.lines++;
      recordLine(shape, parseRecord(line));
    }
  }
  return shape;
}

function printCounter(title, counter, olderCounter) {
  const rows = [...counter.entries()]
    .filter(([key]) => !olderCounter || !olderCounter.has(key))
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_ROWS);
  if (!rows.length) {
    return;
  }
  process.stdout.write(`\n${title}\n`);
  for (const [key, count] of rows) {
    process.stdout.write(`  ${String(count).padStart(COUNT_COLUMN_WIDTH)}  ${key}\n`);
  }
}

const [firstFolder, secondFolder] = process.argv.slice(FIRST_ARGUMENT_INDEX);
if (!firstFolder) {
  process.stderr.write("Usage: node scripts/survey-transcripts.mjs <folder> [<newer folder>]\n");
  process.exitCode = 1;
} else {
  const older = secondFolder ? await survey(firstFolder) : undefined;
  const shape = await survey(secondFolder ?? firstFolder);
  process.stdout.write(`${shape.files} files, ${shape.lines} lines, ${shape.badLines} not parseable\n`);
  if (older) {
    process.stdout.write("Showing only what the newer folder adds.\n");
  }
  printCounter("Line types", shape.lineTypes, older?.lineTypes);
  printCounter("Subtypes", shape.subtypes, older?.subtypes);
  printCounter("Content blocks", shape.blockTypes, older?.blockTypes);
  printCounter("Tool names", shape.toolNames, older?.toolNames);
  printCounter("Tool result keys", shape.toolResultKeys, older?.toolResultKeys);
  printCounter("Keys per line type", shape.lineKeys, older?.lineKeys);
}
