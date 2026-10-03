import type { ModelFamilyToPrice, SignalThresholds } from "@/Shared/Protocols/ConfigProtocol.ts";
import type { EvidenceRef, SessionFacts, TokenUsage, ToolCall } from "@/Shared/Protocols/SessionProtocol.ts";
import type { SuggestionStatus } from "@/Shared/Protocols/SuggestionProtocol.ts";

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
  messageIds: string[];
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

export type CostBound = "lower" | "upper" | "estimate";

export interface CostFigures {
  activeMinutes: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface SignalCost extends CostFigures {
  isEstimated: true;
  bound: CostBound;
  method: string;
  fixLoop?: CostFigures;
}

export interface OccurrenceCost {
  activeMs: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

export interface SignalEvidence extends EvidenceRef { cost: OccurrenceCost }

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
  isPartial: boolean;
  partialReasons: string[];
  cost: SignalCost;
  details: SignalDetails;
  evidence: SignalEvidence[];
  evidenceTotal: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  changedAfterEvidence?: PieceChange[];
  handledBy?: HandledBy;
  score: number;
}

export interface SignalOptions {
  idleMs: number;
  modelFamilyToPrice: ModelFamilyToPrice;
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
  isFixLoop?: boolean;
}

export interface OccurrenceGroup {
  id: string;
  type: SignalType;
  title: string;
  occurrences: Occurrence[];
  detailToValueToCount: Partial<Record<CountedDetail, Map<string, number>>>;
  details: SignalDetails;
}

export interface StepCost {
  activeMs: number;
  usage: TokenUsage;
  model?: string;
}
