import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parseJson } from "./guards.js";

export interface JsonLineHandlers {
  /** Called for each line that parses as JSON, with its 1-based line number. */
  onRecord: (record: unknown, lineNumber: number) => void;
  /** Called for each line that doesn't parse, or whose handler throws. */
  onBadLine: () => void;
}

/** Streams a JSONL file line by line, so transcripts of any size are read with bounded memory. */
export async function readJsonLines(file: string, handlers: JsonLineHandlers): Promise<void> {
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) {
      continue;
    }
    const record = parseJson(line);
    if (record === undefined) {
      handlers.onBadLine();
      continue;
    }
    try {
      handlers.onRecord(record, lineNumber);
    } catch {
      // A line in a shape we don't understand must never stop the analysis (format drift).
      handlers.onBadLine();
    }
  }
}
