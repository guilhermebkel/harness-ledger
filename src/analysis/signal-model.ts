import type { EvidenceRef, SessionFacts, TokenUsage } from "../core/types.js";
import type { SuggestionStatus } from "../state/store.js";
import type { PriceTable } from "./cost.js";
import type { Mention } from "./mentions.js";
import type { SignalThresholds } from "../state/config.js";

export type SignalType
  = | "failed_command"
    | "tool_error"
    | "permission_denied"
    | "hook_blocked"
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

/** Details that only some signal types carry. */
export interface SignalDetails {
  /** failed_command: the errors seen, most frequent first. */
  errors?: CountedValue[];
  /** failed_command: the command that worked right after the failure. */
  recoveredWith?: CountedValue[];
  /** failed_command: where the harness already mentions the failing or the working command. */
  mentions?: Mention[];
  /** subagent_reread: files re-read. */
  files?: CountedValue[];
  /** tool_error */
  tool?: string;
  error?: string;
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

export type CountedDetail = "errors" | "recoveredWith" | "files";

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

/** Collects occurrences into groups by signal id. */
export class OccurrenceCollector {
  private readonly idToGroup = new Map<string, OccurrenceGroup>();

  add(id: string, type: SignalType, title: string, occurrence: Occurrence): OccurrenceGroup {
    const group = this.idToGroup.get(id) ?? {
      id,
      type,
      title,
      occurrences: [],
      counters: {},
      details: {},
    };
    group.occurrences.push(occurrence);
    this.idToGroup.set(id, group);
    return group;
  }

  groups(): OccurrenceGroup[] {
    return [...this.idToGroup.values()];
  }
}

export function countDetail(group: OccurrenceGroup, detail: CountedDetail, value: string): void {
  const valueToCount = group.counters[detail] ?? new Map<string, number>();
  valueToCount.set(value, (valueToCount.get(value) ?? 0) + 1);
  group.counters[detail] = valueToCount;
}
