import { createHash } from "node:crypto";

const DEFAULT_HASH_CHARS = 12;

export class HashUtil {
  /** A short sha256, enough to detect changes and build stable ids. */
  static sha(text: string, length = DEFAULT_HASH_CHARS): string {
    return createHash("sha256").update(text).digest("hex").slice(0, length);
  }
}
