// .imh/config.json: thresholds a user may want to tune. People edit this file by hand,
// so every field is validated and falls back to its default on its own.

import type { Config, ModelPrice, NumericConfigKey, PriceTable, SignalThresholds } from "@/Shared/Protocols/ConfigProtocol.js";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.js";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.js";
import { CostService } from "./CostService.js";
import type { StoreService } from "./StoreService.js";

const CONFIG_FILE = "config.json";

const NUMERIC_CONFIG_KEYS: NumericConfigKey[] = [
  "idleMinutes",
  "minSessionsCompare",
  "minRelativeChange",
  "minSessionsForUnused",
  "largePieceTokens",
];

export class ConfigService {
  static readonly DEFAULT_CONFIG: Config = {
    idleMinutes: 5,
    prices: CostService.DEFAULT_PRICES,
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

  constructor(private readonly store: StoreService) {}

  async load(): Promise<Config> {
    const userConfig = GuardUtil.asRecord(await this.store.readJson<unknown>(CONFIG_FILE)) ?? {};
    const defaults = ConfigService.DEFAULT_CONFIG;
    const config: Config = {
      ...defaults,
      prices: {
        ...CostService.DEFAULT_PRICES,
        ...this.readPrices(GuardUtil.asRecord(userConfig.prices)),
      },
      signalThresholds: this.readThresholds(GuardUtil.asRecord(userConfig.signalThresholds)),
    };
    for (const key of NUMERIC_CONFIG_KEYS) {
      config[key] = this.readNonNegative(userConfig[key]) ?? defaults[key];
    }
    return config;
  }

  private readThresholds(userThresholds: UnknownRecord | undefined): SignalThresholds {
    const thresholds: SignalThresholds = { ...ConfigService.DEFAULT_CONFIG.signalThresholds };
    for (const key of Object.keys(thresholds) as (keyof SignalThresholds)[]) {
      thresholds[key] = this.readNonNegative(userThresholds?.[key]) ?? thresholds[key];
    }
    return thresholds;
  }

  private readPrices(userPrices: UnknownRecord | undefined): PriceTable {
    const prices: PriceTable = {};
    for (const [family, value] of Object.entries(userPrices ?? {})) {
      const price = GuardUtil.asRecord(value);
      const input = this.readNonNegative(price?.input);
      const output = this.readNonNegative(price?.output);
      if (input === undefined || output === undefined) {
        continue;
      }
      const modelPrice: ModelPrice = {
        input,
        output,
        cacheRead: this.readNonNegative(price?.cacheRead),
        cacheWrite: this.readNonNegative(price?.cacheWrite),
      };
      prices[family] = modelPrice;
    }
    return prices;
  }

  private readNonNegative(value: unknown): number | undefined {
    const number = GuardUtil.asNumber(value);
    return number !== undefined && number >= 0 ? number : undefined;
  }
}
