import type { PriceTable, SignalThresholds } from "./ConfigProtocol.js";
import type { EvidenceRef, SessionFacts, TokenUsage } from "./SessionProtocol.js";
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

/** Details that only some signal types carry. */
export interface SignalDetails {
  /** api_error: models the failing requests used, most frequent first. */
  models?: CountedValue[];
  /** failed_command: the errors seen, most frequent first. */
  errors?: CountedValue[];
  /** failed_command: the command that worked right after the failure. */
  recoveredWith?: CountedValue[];
  /** failed_command: where the harness already mentions the failing or the working command. */
  mentions?: Mention[];
  /** subagent_reread and repeated_read: files re-read, most re-read first. */
  files?: CountedValue[];
  /** tool_error */
  tool?: string;
  error?: string;
  /** context_heavy: what filled the context ("source (×loads)"), with the approximate tokens it added. */
  sources?: CountedValue[];
  /** repeated_workflow: the commands, in order. */
  steps?: string[];
  /** context_compaction: the largest context seen right before compacting. */
  maxContextTokens?: number;
  /** repeated_request */
  example?: string;
  commands?: string[];
  /** unused_piece and large_piece */
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
  /** Pieces involved: inventory ids when known (e.g. "agent:code-reviewer"), or "main". */
  pieces: string[];
  occurrences: number;
  sessions: number;
  /** The evidence is incomplete: few sessions, unresolved subagent type, or the piece changed since. */
  isPartial: boolean;
  partialReasons: string[];
  cost: SignalCost;
  details: SignalDetails;
  evidence: EvidenceRef[];
  evidenceTotal: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  /** Pieces that changed after the newest evidence: the problem may already be fixed. */
  changedAfterEvidence?: PieceChange[];
  /** A suggestion already exists for this signal. */
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

/** One time a pattern happened, with what it cost. */
export interface Occurrence {
  session: SessionFacts;
  ref: EvidenceRef;
  pieces: string[];
  activeMs: number;
  usage: TokenUsage;
  model?: string;
}

/** Occurrences of one pattern, collected across sessions before they become a signal. */
export interface OccurrenceGroup {
  id: string;
  type: SignalType;
  title: string;
  occurrences: Occurrence[];
  counters: Partial<Record<CountedDetail, Map<string, number>>>;
  details: SignalDetails;
}

/** The cost a detector estimates for one step. */
export interface StepCost {
  activeMs: number;
  usage: TokenUsage;
  model?: string;
}
