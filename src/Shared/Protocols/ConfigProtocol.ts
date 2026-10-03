export interface ModelPrice {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  cacheReadUsdPerMillionTokens?: number;
  cacheWriteUsdPerMillionTokens?: number;
}

export type ModelFamilyToPrice = Record<string, ModelPrice>;

export interface SignalThresholds {
  minFailures: number;
  minFailureSessions: number;
  minRepeatedEvents: number;
  minReadsPerFile: number;
  minExtraReads: number;
  minSubagentRereads: number;
  minRepeatedRequestSessions: number;
  minWorkflowSessions: number;
  minWorkflowRuns: number;
  minHeavySourceTokens: number;
  minHeavySourceLoads: number;
  minHugeResultTokens: number;
  minWorkflowSteps: number;
  repeatedRequestSimilarity: number;
}

export interface Config {
  idleMinutes: number;
  modelFamilyToPrice: ModelFamilyToPrice;
  minSessionsCompare: number;
  minRelativeChange: number;
  minSessionsForUnused: number;
  largePieceTokens: number;
  signalThresholds: SignalThresholds;
}

export type NumericConfigKey
  = | "idleMinutes"
    | "minSessionsCompare"
    | "minRelativeChange"
    | "minSessionsForUnused"
    | "largePieceTokens";
