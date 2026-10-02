export type FindingClass
  = | "rule_ignored"
    | "partial_instruction"
    | "missing_instruction"
    | "structure_change"
    | "out_of_scope"
    | "already_handled";

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "applied";

export interface Suggestion {
  /** Derived from the signal ids and the piece, so the same problem never gets two ids. */
  id: string;
  title: string;
  class: FindingClass;
  /** Piece id, e.g. "agent:code-reviewer". */
  piece?: string;
  /** Signal ids the suggestion came from, e.g. "failed_command:npm test". */
  signals: string[];
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  /** Harness fingerprint right after the suggestion was applied, for before/after. */
  appliedFingerprint?: string;
  note?: string;
  /** Redacted summary of the proposed change. */
  change?: string;
}

export interface NewSuggestion {
  title: string;
  class: FindingClass;
  piece?: string;
  signals: string[];
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
}
