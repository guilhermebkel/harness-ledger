import type { CostBound, CostFigures } from "@/Shared/Protocols/SignalProtocol.ts";

export type FindingClass
  = | "rule_ignored"
    | "partial_instruction"
    | "missing_instruction"
    | "structure_change"
    | "out_of_scope"
    | "already_handled";

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "applied";

export interface OccurrenceRef {
  sessionId: string;
  line: number;
}

export interface SuggestionCost extends CostFigures {
  bound: CostBound;
  // Why: how many occurrences the cost covers; the rest of a signal counts when the suggestion lists none of them.
  occurrences: number;
  isPartial: boolean;
  partialReasons: string[];
}

export interface Suggestion {
  // Why: derived from the signal ids and the piece, so the same problem never gets two ids.
  id: string;
  title: string;
  class: FindingClass;
  piece?: string;
  signals: string[];
  occurrences?: OccurrenceRef[];
  cost?: SuggestionCost;
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  appliedFingerprint?: string;
  note?: string;
  // Why: redacted.
  change?: string;
}

export interface NewSuggestion {
  title: string;
  class: FindingClass;
  piece?: string;
  signals: string[];
  occurrences?: OccurrenceRef[];
  change?: string;
  status?: SuggestionStatus;
  note?: string;
}

export interface ExistingSuggestion {
  id: string;
  status: SuggestionStatus;
}

export interface AddSuggestionsResult {
  added: string[];
  existing: ExistingSuggestion[];
  total: number;
  // Why: by id, for every suggestion in the call; costs from one call never overlap, so they can be added up.
  costs: Record<string, SuggestionCost>;
  covered?: CostFigures;
}
