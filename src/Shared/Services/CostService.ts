import type { PriceTable } from "@/Shared/Protocols/ConfigProtocol.js";
import type { TokenUsage } from "@/Shared/Protocols/SessionProtocol.js";

const DEFAULT_FAMILY = "default";
const TOKENS_PER_MILLION = 1_000_000;
const CACHE_READ_INPUT_RATIO = 0.1;
const CACHE_WRITE_INPUT_RATIO = 1.25;
// Why: unlisted models from this vendor fall back to the default price; anything else (e.g. a model behind a proxy) is unpriced rather than guessed.
const DEFAULT_PRICED_VENDOR = "claude";

export class CostService {
  // Why: list prices may be outdated; .imh/config.json overrides them.
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

  /**
   * Why: The price-table key for a model: a listed family it contains, "default" for an unnamed model or an
   * unlisted Claude model, and undefined for anything else, which is left unpriced rather than guessed.
   * Add a key to `prices` in .imh/config.json (e.g. "glm") to price other models.
   */
  modelFamily(model: string | undefined): string | undefined {
    const normalizedModel = model?.toLowerCase();
    if (!normalizedModel) {
      return DEFAULT_FAMILY;
    }
    const family = Object.keys(this.prices).find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
    if (family) {
      return family;
    }
    return normalizedModel.includes(DEFAULT_PRICED_VENDOR) ? DEFAULT_FAMILY : undefined;
  }

  isPriced(model: string | undefined): boolean {
    return this.modelFamily(model) !== undefined;
  }

  // Why: 0 for an unpriced model; callers report those models so the gap is visible.
  costUsd(usage: TokenUsage, model: string | undefined): number {
    const family = this.modelFamily(model);
    if (family === undefined) {
      return 0;
    }
    const price = this.prices[family]
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
