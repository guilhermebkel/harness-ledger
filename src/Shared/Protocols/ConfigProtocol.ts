/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/** Model family (matched as a substring of the model id) → price. `default` covers unknown models. */
export type PriceTable = Record<string, ModelPrice>;

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

/** `.imh/config.json`: thresholds a user may want to tune. */
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

export type NumericConfigKey
  = | "idleMinutes"
    | "minSessionsCompare"
    | "minRelativeChange"
    | "minSessionsForUnused"
    | "largePieceTokens";
