import type { Config, ModelPrice, NumericConfigKey, ModelFamilyToPrice, SignalThresholds } from "@/Shared/Protocols/ConfigProtocol.ts";
import type { UnknownRecord } from "@/Shared/Protocols/UtilProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";
import { CostService } from "@/Shared/Services/CostService.ts";
import type { StoreService } from "@/Shared/Services/StoreService.ts";

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
    modelFamilyToPrice: CostService.DEFAULT_MODEL_FAMILY_TO_PRICE,
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
      minWorkflowSessions: 4,
      minWorkflowRuns: 6,
      minHeavySourceTokens: 50_000,
      minHeavySourceLoads: 3,
      minHugeResultTokens: 20_000,
      minWorkflowSteps: 3,
      repeatedRequestSimilarity: 0.5,
    },
  };

  constructor(private readonly store: StoreService) {}

  async load(): Promise<Config> {
    const userConfig = GuardUtil.asRecord(await this.store.readJson<unknown>(CONFIG_FILE)) ?? {};
    const defaults = ConfigService.DEFAULT_CONFIG;
    const config: Config = {
      ...defaults,
      modelFamilyToPrice: {
        ...CostService.DEFAULT_MODEL_FAMILY_TO_PRICE,
        ...this.readModelFamilyToPrice(GuardUtil.asRecord(userConfig.modelFamilyToPrice)),
      },
      signalThresholds: this.readThresholds(GuardUtil.asRecord(userConfig.signalThresholds)),
    };
    for (const key of NUMERIC_CONFIG_KEYS) {
      // Why: people edit .harness-ledger/config.json by hand, so each field falls back to its default on its own.
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

  private readModelFamilyToPrice(userPrices: UnknownRecord | undefined): ModelFamilyToPrice {
    const modelFamilyToPrice: ModelFamilyToPrice = {};
    for (const [family, value] of Object.entries(userPrices ?? {})) {
      const price = GuardUtil.asRecord(value);
      const input = this.readNonNegative(price?.inputUsdPerMillionTokens);
      const output = this.readNonNegative(price?.outputUsdPerMillionTokens);
      if (input === undefined || output === undefined) {
        continue;
      }
      const modelPrice: ModelPrice = {
        inputUsdPerMillionTokens: input,
        outputUsdPerMillionTokens: output,
        cacheReadUsdPerMillionTokens: this.readNonNegative(price?.cacheReadUsdPerMillionTokens),
        cacheWriteUsdPerMillionTokens: this.readNonNegative(price?.cacheWriteUsdPerMillionTokens),
      };
      modelFamilyToPrice[family] = modelPrice;
    }
    return modelFamilyToPrice;
  }

  private readNonNegative(value: unknown): number | undefined {
    const number = GuardUtil.asNumber(value);
    return number !== undefined && number >= 0 ? number : undefined;
  }
}
