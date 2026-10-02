import type { TokenUsage } from "../core/types.js";

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Model family (matched as a substring of the model id) → price. `default` covers unknown models. */
export type PriceTable = Record<string, ModelPrice>;

const DEFAULT_FAMILY = "default";
const TOKENS_PER_MILLION = 1_000_000;
/** Cache pricing relative to the input price, used when a table doesn't set it. */
const CACHE_READ_INPUT_RATIO = 0.1;
const CACHE_WRITE_INPUT_RATIO = 1.25;

/** List prices that may be outdated; override them in .imh/config.json. Every cost is labeled as an estimate. */
export const DEFAULT_PRICES: PriceTable = {
  opus: {
    input: 5,
    output: 25,
  },
  sonnet: {
    input: 3,
    output: 15,
  },
  haiku: {
    input: 1,
    output: 5,
  },
  [DEFAULT_FAMILY]: {
    input: 3,
    output: 15,
  },
};

export const ZERO_USAGE: TokenUsage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export function modelFamily(model: string | undefined, prices: PriceTable): string {
  const normalizedModel = model?.toLowerCase();
  if (!normalizedModel) {
    return DEFAULT_FAMILY;
  }
  const family = Object.keys(prices).find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
  return family ?? DEFAULT_FAMILY;
}

export function usageCostUsd(usage: TokenUsage, model: string | undefined, prices: PriceTable): number {
  const price = prices[modelFamily(model, prices)] ?? prices[DEFAULT_FAMILY] ?? DEFAULT_PRICES[DEFAULT_FAMILY];
  if (!price) {
    return 0;
  }
  const cacheReadPrice = price.cacheRead ?? price.input * CACHE_READ_INPUT_RATIO;
  const cacheWritePrice = price.cacheWrite ?? price.input * CACHE_WRITE_INPUT_RATIO;
  const weightedTokens = usage.input * price.input
    + usage.output * price.output
    + usage.cacheRead * cacheReadPrice
    + usage.cacheWrite * cacheWritePrice;
  return weightedTokens / TOKENS_PER_MILLION;
}

export function totalTokens(usage: TokenUsage): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

export function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
  };
}
