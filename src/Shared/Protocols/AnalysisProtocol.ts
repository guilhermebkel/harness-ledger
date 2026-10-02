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

export interface AnalysisTotals extends SessionTotals {
  lostToFailures: CostSummary;
  inCorrectedOrInterruptedTurns: CostSummary;
  isEstimated: true;
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

export type CompareVerdict = "insufficient_data" | "improved" | "worse" | "no_clear_change";

export interface CompareDeltas {
  errorRate: number | null;
  correctionsPerSession: number | null;
  activeMinutesPerInvocation: number | null;
  tokensPerInvocation: number | null;
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
  deltas: CompareDeltas;
  caveats: string[];
}

/** When a piece changed, and how that was found out. */
export interface ChangePoint {
  changedAtMs: number;
  source: string;
}
