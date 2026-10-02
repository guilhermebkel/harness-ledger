import type { PriceTable } from "../Protocols/ConfigProtocol.js";
import type { TokenUsage } from "../Protocols/SessionProtocol.js";

const DEFAULT_FAMILY = "default";
const TOKENS_PER_MILLION = 1_000_000;
/** Cache pricing relative to the input price, used when a table doesn't set it. */
const CACHE_READ_INPUT_RATIO = 0.1;
const CACHE_WRITE_INPUT_RATIO = 1.25;

/** Turns token usage into estimated USD with a price table. Every cost it returns is an estimate. */
export class CostService {
  /** List prices that may be outdated; override them in .imh/config.json. */
  static readonly DEFAULT_PRICES: PriceTable = {
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

  constructor(private readonly prices: PriceTable) {}

  modelFamily(model: string | undefined): string {
    const normalizedModel = model?.toLowerCase();
    if (!normalizedModel) {
      return DEFAULT_FAMILY;
    }
    const family = Object.keys(this.prices).find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
    return family ?? DEFAULT_FAMILY;
  }

  costUsd(usage: TokenUsage, model: string | undefined): number {
    const price = this.prices[this.modelFamily(model)]
      ?? this.prices[DEFAULT_FAMILY]
      ?? CostService.DEFAULT_PRICES[DEFAULT_FAMILY];
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
}
