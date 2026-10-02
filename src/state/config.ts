import { DEFAULT_PRICES, type PriceTable } from "../analysis/cost.js";
import type { Store } from "./store.js";

export interface Config {
  /** Gaps longer than this (minutes) count as idle and are excluded from time estimates. */
  idleMinutes: number;
  /** USD per million tokens by model family. */
  prices: PriceTable;
  /** Minimum sessions on each side of a before/after comparison. */
  minSessionsCompare: number;
  /** Minimum sessions in the period before reporting unused pieces. */
  minSessionsForUnused: number;
  /** Instruction/skill/agent files above this many tokens are reported as large. */
  largePieceTokens: number;
}

export const DEFAULT_CONFIG: Config = {
  idleMinutes: 5,
  prices: DEFAULT_PRICES,
  minSessionsCompare: 5,
  minSessionsForUnused: 10,
  largePieceTokens: 2500,
};

/** Reads .imh/config.json, falling back to defaults field by field. */
export async function loadConfig(store: Store): Promise<Config> {
  const user = (await store.readJson<Partial<Config>>("config.json")) ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...user,
    prices: { ...DEFAULT_PRICES, ...(user.prices ?? {}) },
  };
}
