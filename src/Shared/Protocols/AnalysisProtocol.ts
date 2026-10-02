import type { CompactPiece, InventoryChange } from "./HarnessProtocol.js";
import type { AssistantMessage, SessionFacts, UserPrompt } from "./SessionProtocol.js";
import type { CountedValue, Signal } from "./SignalProtocol.js";

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
  /** Platforms and shells the sessions ran on, by number of sessions. Suggested scripts must run there. */
  environment: {
    platforms: CountedValue[];
    shells: CountedValue[];
  };
  /** Stages in their usual order, with how much each one happened. */
  process: StageProfile[];
  /** Work commands seen in at least two runs, most widespread first. Exploration (ls, cat, grep) is left out. */
  commonCommands: CommonCommand[];
  signals: Signal[];
  suggestions: Record<string, number>;
  dataDir: string;
}

/** The usual order of software work; a harness can support each stage with its own pieces. */
export type ProcessStage = "setup" | "planning" | "exploration" | "implementation" | "validation" | "delivery";

/** How much of the sessions went into one stage, measured from the steps the agent took. */
export interface StageProfile {
  stage: ProcessStage;
  sessions: number;
  steps: number;
  /** Failed steps, and plans or calls the person rejected. */
  failures: number;
  /** Approximate tokens the stage's tool results added to the context (file reads, command output). */
  contextTokens: number;
  /** Pieces of the harness that ran during this stage's steps. */
  pieces: string[];
  /** The most frequent command keys of the stage, for setup, validation and delivery. */
  commands: string[];
}

/** A work command the agent runs in this project, the raw material for a project's first instructions. */
export interface CommonCommand {
  /** Grouping key, e.g. "npm run build". */
  key: string;
  runs: number;
  sessions: number;
  failures: number;
  /** The latest successful run in full, redacted: shows the setup it needed (version manager, flags). */
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
