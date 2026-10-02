import { createHash } from "node:crypto";
import { homedir } from "node:os";

const DEFAULT_HASH_CHARS = 12;
const CHARS_PER_TOKEN = 4;
const DECIMAL_BASE = 10;

export function sha(text: string, length = DEFAULT_HASH_CHARS): string {
  return createHash("sha256").update(text).digest("hex").slice(0, length);
}

/** A rough estimate, good enough to compare the size of harness pieces. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Replaces the home directory prefix with `~`, so outputs don't leak usernames. */
export function tildify(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export function untildify(path: string): string {
  return path.startsWith("~") ? `${homedir()}${path.slice(1)}` : path;
}

export function round(value: number, digits = 2): number {
  const factor = DECIMAL_BASE ** digits;
  return Math.round(value * factor) / factor;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function countBy(values: string[]): Record<string, number> {
  const valueToCount: Record<string, number> = {};
  for (const value of values) {
    valueToCount[value] = (valueToCount[value] ?? 0) + 1;
  }
  return valueToCount;
}

/** Runs async work over items with a concurrency limit, keeping the input order in the results. */
export async function mapWithConcurrency<Item, Result>(
  items: Item[],
  concurrency: number,
  work: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex++;
      results[index] = await work(items[index] as Item);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}
