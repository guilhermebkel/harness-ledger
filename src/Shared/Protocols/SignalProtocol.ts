import type { PriceTable, SignalThresholds } from "./ConfigProtocol.js";
import type { EvidenceRef, SessionFacts, TokenUsage, ToolCall } from "./SessionProtocol.js";
import type { SuggestionStatus } from "./SuggestionProtocol.js";

export type SignalType
  = | "failed_command"
    | "tool_error"
    | "permission_denied"
    | "hook_blocked"
    | "api_error"
    | "context_compaction"
    | "repeated_workflow"
    | "context_heavy"
    | "repeated_read"
    | "subagent_reread"
    | "repeated_request"
    | "user_correction"
    | "interruption"
    | "unused_piece"
    | "large_piece";

export interface CountedValue {
  value: string;
  count: number;
}

export interface Mention {
  piece: string;
  path: string;
  line: number;
  text: string;
  term: string;
}

export type FailureChainKind = "wrong_command" | "fix_loop" | "retry" | "unrecovered";

export interface FailureChain {
  failures: ToolCall[];
  recovery?: ToolCall;
  kind: FailureChainKind;
  cost: StepCost;
}

export interface ChainSummary {
  chains: number;
  recovered: number;
  attempts: number;
  fixLoops: number;
}

export interface SignalDetails {
  chains?: ChainSummary;
  models?: CountedValue[];
  errors?: CountedValue[];
  recoveredWith?: CountedValue[];
  mentions?: Mention[];
  files?: CountedValue[];
  tool?: string;
  error?: string;
  // Why: "source (×loads)" weighted by tokens; findings.md reads this format.
  sources?: CountedValue[];
  steps?: string[];
  maxContextTokens?: number;
  example?: string;
  commands?: string[];
  scope?: string;
  path?: string;
  approxTokens?: number;
  description?: string;
  isLoadedEveryTurn?: boolean;
}

export type CountedDetail = "errors" | "recoveredWith" | "files" | "models" | "sources";

export interface SignalCost {
  activeMinutes: number;
  tokens: number;
  // Why: includes cache reads and writes.
  inputTokens: number;
  outputTokens: number;
  usd: number;
  isEstimated: true;
}

export interface PieceChange {
  piece: string;
  modifiedAt: string;
}

export interface HandledBy {
  suggestionId: string;
  status: SuggestionStatus;
}

export interface Signal {
  id: string;
  type: SignalType;
  title: string;
  pieces: string[];
  occurrences: number;
  sessions: number;
  // Why: few sessions, an unresolved subagent type, or the piece changed since.
  isPartial: boolean;
  partialReasons: string[];
  cost: SignalCost;
  details: SignalDetails;
  evidence: EvidenceRef[];
  evidenceTotal: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  changedAfterEvidence?: PieceChange[];
  handledBy?: HandledBy;
  score: number;
}

export interface SignalOptions {
  idleMs: number;
  prices: PriceTable;
  maxEvidence: number;
  minSessionsForUnused: number;
  largePieceTokens: number;
  thresholds: SignalThresholds;
}

export interface Occurrence {
  session: SessionFacts;
  ref: EvidenceRef;
  pieces: string[];
  activeMs: number;
  usage: TokenUsage;
  model?: string;
}

export interface OccurrenceGroup {
  id: string;
  type: SignalType;
  title: string;
  occurrences: Occurrence[];
  counters: Partial<Record<CountedDetail, Map<string, number>>>;
  details: SignalDetails;
}

export interface StepCost {
  activeMs: number;
  usage: TokenUsage;
  model?: string;
}
