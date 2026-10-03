// Why: USD per million tokens.
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

// Why: the family is matched as a substring of the model id; `default` covers unlisted Claude models.
export type PriceTable = Record<string, ModelPrice>;

export interface SignalThresholds {
  // Why: a failure is reported at this many occurrences, or when it happens in `minFailureSessions` sessions.
  minFailures: number;
  minFailureSessions: number;
  minRepeatedEvents: number;
  // Why: counted per file within one thread.
  minReadsPerFile: number;
  // Why: re-reads after the first read, not right after an edit.
  minExtraReads: number;
  minSubagentRereads: number;
  minRepeatedRequestSessions: number;
  minWorkflowSessions: number;
  // Why: or this many runs within long sessions, however few the sessions.
  minWorkflowRuns: number;
  // Why: per piece and source, over the whole period.
  minHeavySourceTokens: number;
  // Why: unless a single load reaches `minHugeResultTokens`.
  minHeavySourceLoads: number;
  minHugeResultTokens: number;
  minWorkflowSteps: number;
  // Why: word-set similarity, from 0 to 1.
  repeatedRequestSimilarity: number;
}

export interface Config {
  // Why: longer gaps are idle and excluded from time estimates.
  idleMinutes: number;
  prices: PriceTable;
  minSessionsCompare: number;
  // Why: relative change, from 0 to 1.
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
