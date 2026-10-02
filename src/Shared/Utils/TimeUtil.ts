import { NumberUtil } from "./NumberUtil.js";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const MS_PER_SECOND = 1000;

type PeriodUnit = "h" | "d" | "w" | "m";

export class TimeUtil {
  static readonly MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
  static readonly MS_PER_HOUR = MINUTES_PER_HOUR * TimeUtil.MS_PER_MINUTE;
  static readonly MS_PER_DAY = HOURS_PER_DAY * TimeUtil.MS_PER_HOUR;

  private static readonly PERIOD_UNIT_TO_MS: Record<PeriodUnit, number> = {
    h: TimeUtil.MS_PER_HOUR,
    d: TimeUtil.MS_PER_DAY,
    w: DAYS_PER_WEEK * TimeUtil.MS_PER_DAY,
    m: DAYS_PER_MONTH * TimeUtil.MS_PER_DAY,
  };

  /**
   * Turns "14d", "2w", "6h", "3m" (months) or an ISO date into an epoch-ms point in time.
   * A relative period is counted back from `nowAtMs`.
   */
  static parsePointInTime(value: string | undefined, nowAtMs = Date.now()): number | undefined {
    if (!value) {
      return undefined;
    }
    const relative = /^(\d+)\s*([hdwm])$/i.exec(value.trim());
    if (relative) {
      const amount = Number(relative[1]);
      const unit = (relative[2] ?? "d").toLowerCase() as PeriodUnit;
      return nowAtMs - amount * TimeUtil.PERIOD_UNIT_TO_MS[unit];
    }
    const absoluteAtMs = Date.parse(value);
    if (Number.isNaN(absoluteAtMs)) {
      throw new Error(`Invalid date or period: "${value}". Use e.g. 14d, 2w, 6h or 2026-09-01.`);
    }
    return absoluteAtMs;
  }

  static msToMinutes(durationMs: number): number {
    return NumberUtil.round(durationMs / TimeUtil.MS_PER_MINUTE, 1);
  }

  static toIso(atMs: number | undefined): string | undefined {
    return atMs === undefined ? undefined : new Date(atMs).toISOString();
  }

  /** Sum of the gaps between consecutive events, skipping gaps longer than `idleMs` (the person was away). */
  static activeTime(sortedEventsAtMs: number[], idleMs: number): number {
    let activeMs = 0;
    for (let index = 1; index < sortedEventsAtMs.length; index++) {
      const gapMs = (sortedEventsAtMs[index] ?? 0) - (sortedEventsAtMs[index - 1] ?? 0);
      const isWithinActivity = gapMs > 0 && gapMs <= idleMs;
      if (isWithinActivity) {
        activeMs += gapMs;
      }
    }
    return activeMs;
  }
}
