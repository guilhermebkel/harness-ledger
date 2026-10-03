import type { CompactPiece, InventoryChange } from "./HarnessProtocol.js";
import type { AssistantMessage, SessionFacts, UserPrompt } from "./SessionProtocol.js";
import type { CountedValue, Signal } from "./SignalProtocol.js";

export interface SessionIndex {
  // Why: sorted by time; cost estimates rely on it.
  threadIdToMessages: Map<string, AssistantMessage[]>;
  toolCallIdToPieces: Map<string, string[]>;
  promptToPreviousTurnPieces: Map<UserPrompt, string[]>;
}

export type AttributedKind = "agent" | "skill" | "command";

export interface AvailableHistory {
  // Why: counted before the period filter.
  count: number;
  oldestAt?: string;
  newestAt?: string;
}

export interface LoadResult {
  sessions: SessionFacts[];
  available: AvailableHistory;
  parsedCount: number;
  cachedCount: number;
  unparsedLines: number;
}

export interface Period {
  periodStartAtMs?: number;
  periodEndAtMs?: number;
}

export interface LoadOptions extends Period {
  projectDir: string;
  idleMs: number;
  shouldReadAllProjects?: boolean;
  shouldSkipCache?: boolean;
  excludedSessionIds?: string[];
}

export interface PerInvocation {
  activeMinutes: number;
  tokens: number;
  // Why: includes cache reads and writes.
  inputTokens: number;
  outputTokens: number;
  usd: number;
  toolCalls: number;
}

export interface PieceUsage {
  piece: string;
  invocations: number;
  sessions: number;
  toolCalls: number;
  toolErrors: number;
  errorRate: number;
  activeMinutes: number;
  tokens: number;
  usd: number;
  models: string[];
  perInvocation?: PerInvocation;
}

export interface CostSummary {
  activeMinutes: number;
  tokens: number;
  // Why: includes cache reads and writes.
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface SessionTotals extends CostSummary { subagentActiveMinutes: number }

// Why: the provider's own totals; never added to the script's estimates.
export interface ReportedTotals {
  // Why: may miss runs of resumed sessions.
  costUsd?: number;
  sessionsWithCost: number;
  isCostPartial: boolean;
  // Why: wall-clock, including waits inside a turn (permission prompts, questions).
  turnMinutes?: number;
  turns: number;
}

// Why: the categories don't overlap: a turn already in a failure chain or a rejected plan is left out of the
// correction after it, and fix loops are kept apart from failures (fixing the code is work, not waste).
export interface AnalysisTotals extends SessionTotals {
  lostToFailures: CostSummary;
  inFixLoops: CostSummary;
  lostToRereads: CostSummary;
  inCorrectedOrInterruptedTurns: CostSummary;
  isEstimated: true;
  reportedByProvider: ReportedTotals;
  // Why: their tokens are counted, but their cost is 0 rather than guessed.
  unpricedModels: string[];
  method: string;
  idleMinutes: number;
}

export interface Analysis {
  tool: {
    name: string;
    version: string;
  };
  generatedAt: string;
  project: string;
  provider: string;
  period: {
    since?: string;
    until?: string;
    focus: string[];
  };
  history: {
    transcriptsAvailable: number;
    oldestAt?: string;
    newestAt?: string;
    retentionDays: number;
    retentionSource: string;
    note: string;
  };
  analyzed: {
    sessions: number;
    subagentRuns: number;
    parsedNow: number;
    fromCache: number;
    unparsedLines: number;
  };
  totals: AnalysisTotals;
  inventory: {
    fingerprint: string;
    hasChangedSinceLastRun: boolean;
    changes: InventoryChange[];
    pieces: CompactPiece[];
    notes: string[];
  };
  usage: PieceUsage[];
  // Why: suggested scripts must run on these platforms and shells.
  environment: {
    platforms: CountedValue[];
    shells: CountedValue[];
  };
  process: StageProfile[];
  // Why: exploration (ls, cat, grep) is left out.
  commonCommands: CommonCommand[];
  signals: Signal[];
  suggestions: Record<string, number>;
  dataDir: string;
}

export type ProcessStage = "setup" | "planning" | "exploration" | "implementation" | "validation" | "delivery";

export interface StageProfile {
  stage: ProcessStage;
  sessions: number;
  steps: number;
  // Why: includes plans and calls the person rejected.
  failures: number;
  // Why: approximate, from the characters of tool results.
  contextTokens: number;
  pieces: string[];
  commands: string[];
}

export interface CommonCommand {
  key: string;
  runs: number;
  sessions: number;
  failures: number;
  // Why: redacted; shows the setup the command needed (version manager, flags).
  example?: string;
}

export interface CompactAnalysis extends Analysis {
  omittedSignals: number;
  hint: string;
}

export interface SideSignal {
  id: string;
  occurrences: number;
}

export interface SideMetrics {
  sessions: number;
  invocations: number;
  toolCalls: number;
  errorRate: number;
  perInvocation?: PerInvocation;
  corrections: number;
  correctionsPerSession: number;
  // Why: time from a failure until it worked, per invocation; part of the active time, so it doesn't vote.
  recoveryMinutesPerInvocation?: number;
  signals: SideSignal[];
}

// Why: `mixed` means some metrics got better and others worse, e.g. faster but more expensive.
export type CompareVerdict = "insufficient_data" | "improved" | "worse" | "mixed" | "no_clear_change";

export type ComparedMetric
  = | "errorRate"
    | "correctionsPerSession"
    | "activeMinutesPerInvocation"
    | "usdPerInvocation"
    | "inputTokensPerInvocation"
    | "outputTokensPerInvocation"
    | "recoveryMinutesPerInvocation";

// Why: lower is better for every compared metric.
export interface MetricMove {
  metric: ComparedMetric;
  relativeChange: number;
  direction: "better" | "worse";
  // Why: token moves stay out of the verdict; their cost is already in `usdPerInvocation`.
  isInVerdict: boolean;
}

export interface CompareDeltas {
  errorRate: number | null;
  recoveryMinutesPerInvocation: number | null;
  correctionsPerSession: number | null;
  activeMinutesPerInvocation: number | null;
  tokensPerInvocation: number | null;
  inputTokensPerInvocation: number | null;
  outputTokensPerInvocation: number | null;
  usdPerInvocation: number | null;
}

export interface CompareResult {
  piece: string;
  changedAt?: string;
  changedAtSource: string;
  minSessions: number;
  before: SideMetrics;
  after: SideMetrics;
  verdict: CompareVerdict;
  moves: MetricMove[];
  deltas: CompareDeltas;
  caveats: string[];
}

export interface ChangePoint {
  changedAtMs: number;
  source: string;
}
