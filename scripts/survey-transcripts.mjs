#!/usr/bin/env node
// Describes the shape of a folder of JSONL transcripts without printing their content: line types, keys,
// content-block types, tool names and the keys of tool results, with counts. Use it to learn a new
// provider's format, or, with two folders, to see what a newer export adds.
//
//   node scripts/survey-transcripts.mjs <folder>                 shape of one export
//   node scripts/survey-transcripts.mjs <older> <newer>          only what <newer> adds
//
// Safe to run on real sessions: values are never printed, except line types, block types and tool names.

import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const MAX_DEPTH = 6;
const MAX_ROWS = 40;
const MAX_NAME_CHARS = 60;
const COUNT_COLUMN_WIDTH = 7;
const FIRST_ARGUMENT_INDEX = 2;

// Piping into `head` closes stdout early; that's not an error worth a stack trace.
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
    } else if (entry.name.endsWith(".jsonl")) {
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
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        shape.badLines++;
        continue;
      }
      if (!record || typeof record !== "object") {
        shape.badLines++;
        continue;
      }
      const lineType = nameOf(record.type ?? "(no type)");
      increment(shape.lineTypes, lineType);
      for (const key of Object.keys(record)) {
        increment(shape.lineKeys, `${lineType}.${key}`);
      }
      const subtype = record.subtype ?? record.attachment?.type ?? record.payload?.type;
      if (typeof subtype === "string") {
        increment(shape.subtypes, `${lineType}/${nameOf(subtype)}`);
      }
      const content = record.message?.content ?? record.payload?.content;
      for (const block of Array.isArray(content) ? content : []) {
        if (block && typeof block === "object") {
          increment(shape.blockTypes, `${lineType}/${nameOf(block.type)}`);
          if (typeof block.name === "string") {
            increment(shape.toolNames, block.name.startsWith("mcp__") ? "mcp__*" : nameOf(block.name));
          }
        }
      }
      const toolResult = record.toolUseResult;
      if (toolResult && typeof toolResult === "object" && !Array.isArray(toolResult)) {
        for (const key of Object.keys(toolResult)) {
          increment(shape.toolResultKeys, key);
        }
      }
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
