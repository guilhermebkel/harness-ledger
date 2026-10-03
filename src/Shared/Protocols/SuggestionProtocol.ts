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
  occurrences: number;
  isPartial: boolean;
  partialReasons: string[];
}

export interface Suggestion {
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
  suggestionIdToSuggestionCost: Record<string, SuggestionCost>;
  covered?: CostFigures;
}
