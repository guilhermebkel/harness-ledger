import type { Gap, IssueVersions } from "@/Shared/Protocols/GapProtocol.ts";
import type { CompactPiece, InventoryChange } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { AssistantMessage, SessionFacts, UserPrompt } from "@/Shared/Protocols/SessionProtocol.ts";
import type { CountedValue, Signal } from "@/Shared/Protocols/SignalProtocol.ts";
import type { ProjectChecks } from "@/Shared/Protocols/CheckProtocol.ts";

export interface SessionIndex {
  threadIdToMessages: Map<string, AssistantMessage[]>;
  toolCallIdToPieces: Map<string, string[]>;
  promptToPreviousTurnPieces: Map<UserPrompt, string[]>;
}

export type AttributedKind = "agent" | "skill" | "command";

export interface AvailableHistory {
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
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface SessionTotals extends CostSummary { subagentActiveMinutes: number }

export interface ReportedTotals {
  costUsd?: number;
  sessionsWithCost: number;
  isCostPartial: boolean;
  turnMinutes?: number;
  turns: number;
}

export interface AnalysisTotals extends SessionTotals {
  lostToFailures: CostSummary;
  inFixLoops: CostSummary;
  lostToRereads: CostSummary;
  inCorrectedOrInterruptedTurns: CostSummary;
  isEstimated: true;
  reportedByProvider: ReportedTotals;
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
  environment: {
    platforms: CountedValue[];
    shells: CountedValue[];
  };
  process: StageProfile[];
  commonCommands: CommonCommand[];
  checks: ProjectChecks;
  gaps: Gap[];
  versions: IssueVersions;
  signals: Signal[];
  suggestionStatusToCount: Record<string, number>;
  dataDir: string;
}

export type ProcessStage = "setup" | "planning" | "exploration" | "implementation" | "validation" | "delivery";

export interface StageProfile {
  stage: ProcessStage;
  sessions: number;
  steps: number;
  failures: number;
  contextTokens: number;
  pieces: string[];
  commands: string[];
}

export interface CommonCommand {
  key: string;
  runs: number;
  sessions: number;
  failures: number;
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
  recoveryMinutesPerInvocation?: number;
  signals: SideSignal[];
}

export type CompareVerdict = "insufficient_data" | "improved" | "worse" | "mixed" | "no_clear_change";

export type ComparedMetric
  = | "errorRate"
    | "correctionsPerSession"
    | "activeMinutesPerInvocation"
    | "usdPerInvocation"
    | "inputTokensPerInvocation"
    | "outputTokensPerInvocation"
    | "recoveryMinutesPerInvocation";

export interface MetricMove {
  metric: ComparedMetric;
  relativeChange: number;
  direction: "better" | "worse";
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
