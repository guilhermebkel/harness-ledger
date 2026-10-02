// .imh/config.json: thresholds a user may want to tune. People edit this file by hand,
// so every field is validated and falls back to its default on its own.

import { DEFAULT_PRICES, type ModelPrice, type PriceTable } from "../analysis/cost.js";
import { asNumber, asRecord, type UnknownRecord } from "../core/guards.js";
import type { Store } from "./store.js";

const CONFIG_FILE = "config.json";

/** Minimum occurrences or sessions before a pattern is reported as a signal. */
export interface SignalThresholds {
  /** Failed commands and tool errors: reported at this many occurrences... */
  minFailures: number;
  /** ...or when they happen in at least this many sessions. */
  minFailureSessions: number;
  /** Permission denials, hook blocks, corrections and interruptions. */
  minRepeatedEvents: number;
  /** Reads of one file within one thread before it counts as re-reading. */
  minReadsPerFile: number;
  /** Re-reads (after the first read, not right after an edit) before a re-read signal. */
  minExtraReads: number;
  /** Subagent reads of files the main thread had already read. */
  minSubagentRereads: number;
  /** Sessions in which a similar request must appear to be a repeated request. */
  minRepeatedRequestSessions: number;
  /** Word-set similarity (0–1) for two requests to count as the same request. */
  repeatedRequestSimilarity: number;
}

export interface Config {
  /** Gaps longer than this count as idle and are excluded from time estimates. */
  idleMinutes: number;
  prices: PriceTable;
  /** Minimum sessions on each side of a before/after comparison. */
  minSessionsCompare: number;
  /** Relative change (0–1) a metric needs before before/after calls it better or worse. */
  minRelativeChange: number;
  /** Minimum sessions in the period before reporting unused pieces. */
  minSessionsForUnused: number;
  /** Instruction, skill and agent files above this size are reported as large. */
  largePieceTokens: number;
  signalThresholds: SignalThresholds;
}

export const DEFAULT_CONFIG: Config = {
  idleMinutes: 5,
  prices: DEFAULT_PRICES,
  minSessionsCompare: 5,
  minRelativeChange: 0.2,
  minSessionsForUnused: 10,
  largePieceTokens: 2500,
  signalThresholds: {
    minFailures: 3,
    minFailureSessions: 2,
    minRepeatedEvents: 2,
    minReadsPerFile: 3,
    minExtraReads: 2,
    minSubagentRereads: 3,
    minRepeatedRequestSessions: 3,
    repeatedRequestSimilarity: 0.5,
  },
};

type NumericConfigKey
  = | "idleMinutes"
    | "minSessionsCompare"
    | "minRelativeChange"
    | "minSessionsForUnused"
    | "largePieceTokens";

const NUMERIC_CONFIG_KEYS: NumericConfigKey[] = [
  "idleMinutes",
  "minSessionsCompare",
  "minRelativeChange",
  "minSessionsForUnused",
  "largePieceTokens",
];

export async function loadConfig(store: Store): Promise<Config> {
  const userConfig = asRecord(await store.readJson<unknown>(CONFIG_FILE)) ?? {};
  const config: Config = {
    ...DEFAULT_CONFIG,
    prices: {
      ...DEFAULT_PRICES,
      ...readPrices(asRecord(userConfig.prices)),
    },
    signalThresholds: readThresholds(asRecord(userConfig.signalThresholds)),
  };
  for (const key of NUMERIC_CONFIG_KEYS) {
    config[key] = readNonNegative(userConfig[key]) ?? DEFAULT_CONFIG[key];
  }
  return config;
}

function readThresholds(userThresholds: UnknownRecord | undefined): SignalThresholds {
  const thresholds: SignalThresholds = { ...DEFAULT_CONFIG.signalThresholds };
  for (const key of Object.keys(thresholds) as (keyof SignalThresholds)[]) {
    thresholds[key] = readNonNegative(userThresholds?.[key]) ?? thresholds[key];
  }
  return thresholds;
}

function readPrices(userPrices: UnknownRecord | undefined): PriceTable {
  const prices: PriceTable = {};
  for (const [family, value] of Object.entries(userPrices ?? {})) {
    const price = asRecord(value);
    const input = readNonNegative(price?.input);
    const output = readNonNegative(price?.output);
    if (input === undefined || output === undefined) {
      continue;
    }
    const modelPrice: ModelPrice = {
      input,
      output,
      cacheRead: readNonNegative(price?.cacheRead),
      cacheWrite: readNonNegative(price?.cacheWrite),
    };
    prices[family] = modelPrice;
  }
  return prices;
}

function readNonNegative(value: unknown): number | undefined {
  const number = asNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}
