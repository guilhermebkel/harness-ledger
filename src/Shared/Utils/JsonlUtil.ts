import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { JsonLineHandlers } from "@/Shared/Protocols/UtilProtocol.js";
import { GuardUtil } from "./GuardUtil.js";

export class JsonlUtil {
  // Why: streams line by line, so transcripts of any size use bounded memory.
  static async read(file: string, handlers: JsonLineHandlers): Promise<void> {
    const lines = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber++;
      if (line.trim()) {
        JsonlUtil.handleLine(line, lineNumber, handlers);
      }
    }
  }

  private static handleLine(line: string, lineNumber: number, handlers: JsonLineHandlers): void {
    const record = GuardUtil.parseJson(line);
    if (record === undefined) {
      handlers.onBadLine();
      return;
    }
    try {
      handlers.onRecord(record, lineNumber);
    } catch {
      // Why: a line in a shape we don't understand must never stop the analysis (format drift).
      handlers.onBadLine();
    }
  }
}
