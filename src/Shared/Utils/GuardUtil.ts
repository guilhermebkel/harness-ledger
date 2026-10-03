import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";

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

  static firstString(record: UnknownRecord | undefined, keys: string[]): string | undefined {
    // Why: agents rename fields between versions, so each name is tried in order.
    for (const key of keys) {
      const value = GuardUtil.asString(record?.[key]);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  static isKeyOf<Key extends string>(record: Record<Key, unknown>, value: string | undefined): value is Key {
    return value !== undefined && Object.hasOwn(record, value);
  }

  static parseJson(text: string): unknown {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }
}
