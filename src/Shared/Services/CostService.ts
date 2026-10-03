import type { ModelFamilyToPrice } from "@/Shared/Protocols/ConfigProtocol.ts";
import type { TokenUsage } from "@/Shared/Protocols/SessionProtocol.ts";

const DEFAULT_FAMILY = "default";
const TOKENS_PER_MILLION = 1_000_000;
const CACHE_READ_INPUT_RATIO = 0.1;
const CACHE_WRITE_INPUT_RATIO = 1.25;
// Why: unlisted models from this vendor fall back to the default price; anything else (e.g. a model behind a proxy) is unpriced rather than guessed.
const DEFAULT_PRICED_VENDOR = "claude";

export class CostService {
  // Why: list prices may be outdated; .imh/config.json overrides them.
  static readonly DEFAULT_MODEL_FAMILY_TO_PRICE: ModelFamilyToPrice = {
    opus: {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 25,
    },
    sonnet: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
    },
    haiku: {
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 5,
    },
    [DEFAULT_FAMILY]: {
      inputUsdPerMillionTokens: 3,
      outputUsdPerMillionTokens: 15,
    },
  };

  constructor(private readonly modelFamilyToPrice: ModelFamilyToPrice) {}

  modelFamily(model: string | undefined): string | undefined {
    const normalizedModel = model?.toLowerCase();
    if (!normalizedModel) {
      return DEFAULT_FAMILY;
    }
    const listedFamilies = Object.keys(this.modelFamilyToPrice);
    const family = listedFamilies.find((key) => key !== DEFAULT_FAMILY && normalizedModel.includes(key));
    if (family) {
      return family;
    }
    return normalizedModel.includes(DEFAULT_PRICED_VENDOR) ? DEFAULT_FAMILY : undefined;
  }

  isPriced(model: string | undefined): boolean {
    return this.modelFamily(model) !== undefined;
  }

  costUsd(usage: TokenUsage, model: string | undefined): number {
    const family = this.modelFamily(model);
    if (family === undefined) {
      return 0;
    }
    const price = this.modelFamilyToPrice[family]
      ?? this.modelFamilyToPrice[DEFAULT_FAMILY]
      ?? CostService.DEFAULT_MODEL_FAMILY_TO_PRICE[DEFAULT_FAMILY];
    if (!price) {
      return 0;
    }
    const inputPrice = price.inputUsdPerMillionTokens;
    const cacheReadPrice = price.cacheReadUsdPerMillionTokens ?? inputPrice * CACHE_READ_INPUT_RATIO;
    const cacheWritePrice = price.cacheWriteUsdPerMillionTokens ?? inputPrice * CACHE_WRITE_INPUT_RATIO;
    const weightedTokens = usage.input * inputPrice
      + usage.output * price.outputUsdPerMillionTokens
      + usage.cacheRead * cacheReadPrice
      + usage.cacheWrite * cacheWritePrice;
    return weightedTokens / TOKENS_PER_MILLION;
  }
}
