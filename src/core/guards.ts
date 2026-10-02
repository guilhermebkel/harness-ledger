// Narrowing helpers for data from outside the program (transcripts, settings, stdin).
// External data is `unknown` until it passes through one of these.

export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | undefined {
  const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
  return isPlainObject ? (value as UnknownRecord) : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** The first of several possible keys that holds a string. Agents rename fields between versions. */
export function firstString(record: UnknownRecord | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(record?.[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Compile-time exhaustiveness for switches over unions. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
