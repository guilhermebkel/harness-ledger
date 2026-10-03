import { describe, expect, it } from "vitest";
import { TimeUtil } from "@/Shared/Utils/TimeUtil.ts";

describe("parsePointInTime", () => {
  it("parses periods and dates", () => {
    const nowAtMs = Date.parse("2026-10-01T00:00:00Z");
    expect(TimeUtil.parsePointInTime("2d", nowAtMs)).toBe(Date.parse("2026-09-29T00:00:00Z"));
    expect(TimeUtil.parsePointInTime("2026-09-01", nowAtMs)).toBe(Date.parse("2026-09-01"));
    expect(() => TimeUtil.parsePointInTime("yesterday", nowAtMs)).toThrow("Invalid date or period");
  });
});

describe("activeTime", () => {
  it("excludes idle gaps", () => {
    expect(TimeUtil.activeTime([0, 1000, 2000, 2000 + 10 * 60_000], 5 * 60_000)).toBe(2000);
  });
});
