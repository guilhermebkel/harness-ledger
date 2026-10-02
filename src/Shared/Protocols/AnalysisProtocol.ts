import type { CompactPiece, InventoryChange } from "./HarnessProtocol.js";
import type { AssistantMessage, SessionFacts, UserPrompt } from "./SessionProtocol.js";
import type { Signal } from "./SignalProtocol.js";

/** Lookup tables for one session, used for attribution and cost estimates. */
export interface SessionIndex {
  /** Each thread's assistant messages, sorted by time. */
  threadIdToMessages: Map<string, AssistantMessage[]>;
  toolCallIdToPieces: Map<string, string[]>;
  /** For a correction or interruption: the pieces that ran in the turn before it. */
  promptToPreviousTurnPieces: Map<UserPrompt, string[]>;
}

export type AttributedKind = "agent" | "skill" | "command";

export interface AvailableHistory {
  /** Transcripts for the project before the period filter. */
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
  /** Session ids to leave out, such as the session running the analysis. */
  excludedSessionIds?: string[];
}

export interface PerInvocation {
  activeMinutes: number;
  tokens: number;
  /** Everything the model read: new input plus cache reads and writes. */
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
  /** Only when the piece was invoked at least once. */
  perInvocation?: PerInvocation;
}

export interface CostSummary {
  activeMinutes: number;
  tokens: number;
  usd: number;
}

export interface SessionTotals extends CostSummary { subagentActiveMinutes: number }

/** Totals the provider computed itself, next to the script's estimates (not added to them). */
export interface ReportedTotals {
  /** Sum of the provider's own cost for the sessions that recorded one; may miss runs of resumed sessions. */
  costUsd?: number;
  sessionsWithCost: number;
  /** Some session's cost leaves out a model the provider could not price. */
  isCostPartial: boolean;
  /** Wall-clock time of agent turns, including waits inside a turn (permission prompts, questions). */
  turnMinutes?: number;
  turns: number;
}

export interface AnalysisTotals extends SessionTotals {
  lostToFailures: CostSummary;
  inCorrectedOrInterruptedTurns: CostSummary;
  isEstimated: true;
  reportedByProvider: ReportedTotals;
  /** Models with no price in the table; their tokens are counted but their cost is 0. */
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
  signals: Signal[];
  suggestions: Record<string, number>;
  dataDir: string;
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
  signals: SideSignal[];
}

/** `mixed`: some metrics got better and others worse, e.g. faster but more expensive. */
export type CompareVerdict = "insufficient_data" | "improved" | "worse" | "mixed" | "no_clear_change";

export type ComparedMetric
  = | "errorRate"
    | "correctionsPerSession"
    | "activeMinutesPerInvocation"
    | "usdPerInvocation"
    | "inputTokensPerInvocation"
    | "outputTokensPerInvocation";

/** A metric that moved by at least `minRelativeChange`. Lower is better for every compared metric. */
export interface MetricMove {
  metric: ComparedMetric;
  /** (after - before) / before, e.g. -0.4 is 40% lower. */
  relativeChange: number;
  direction: "better" | "worse";
  /** Token moves are reported but left out of the verdict: their cost is already in `usdPerInvocation`. */
  isInVerdict: boolean;
}

export interface CompareDeltas {
  errorRate: number | null;
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
  /** The metrics behind the verdict, so a report can say "same cost, 40% faster". */
  moves: MetricMove[];
  deltas: CompareDeltas;
  caveats: string[];
}

/** When a piece changed, and how that was found out. */
export interface ChangePoint {
  changedAtMs: number;
  source: string;
}
