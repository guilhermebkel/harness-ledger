import type { UnknownRecord } from "../Protocols/UtilProtocol.js";

/** Narrowing for data from outside the program (transcripts, settings, stdin): it is `unknown` until it passes here. */
export class GuardUtil {
  static asRecord(value: unknown): UnknownRecord | undefined {
    const isPlainObject = typeof value === "object" && value !== null && !Array.isArray(value);
    return isPlainObject ? (value as UnknownRecord) : undefined;
  }

  static asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  static asNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  static asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? (value as unknown[]) : [];
  }

  /** The first of several possible keys that holds a string. Agents rename fields between versions. */
  static firstString(record: UnknownRecord | undefined, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = GuardUtil.asString(record?.[key]);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  static parseJson(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }
}
