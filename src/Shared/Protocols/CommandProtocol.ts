import type { AvailableHistory } from "./AnalysisProtocol.js";
import type { Config } from "./ConfigProtocol.js";
import type { CompactPiece, InventoryChange, Retention } from "./HarnessProtocol.js";
import type { ProviderType } from "./ProviderProtocol.js";
import type { Signal } from "./SignalProtocol.js";
import type { SuggestionStatus } from "./SuggestionProtocol.js";

/** Options every command accepts. */
export interface CommonOptions {
  projectDir?: string;
  dataDir?: string;
  provider?: ProviderType;
  isProjectOnly?: boolean;
  shouldReadAllProjects?: boolean;
  shouldSkipCache?: boolean;
  /** Session ids to leave out, such as the session running the analysis. */
  excludedSessionIds?: string[];
}

export interface AnalyzeOptions extends CommonOptions {
  since?: string;
  until?: string;
  focusPieces?: string[];
  maxSignals?: number;
  maxEvidence?: number;
}

export interface CompareOptions extends CommonOptions {
  piece: string;
  /** When the piece changed. Defaults to an applied suggestion's date, then the piece's last change. */
  changedAt?: string;
  since?: string;
}

export interface EvidenceOptions extends CommonOptions {
  /** A signal id, or a unique prefix of one. */
  signalId: string;
  maxEvidence?: number;
}

export interface ListSuggestionsOptions extends CommonOptions { status?: SuggestionStatus }

export interface AddSuggestionsOptions extends CommonOptions {
  /** Raw input; validated where it enters the program. */
  items: unknown;
}

export interface SetSuggestionStatusOptions extends CommonOptions {
  id: string;
  status: SuggestionStatus;
  note?: string;
}

export interface InventoryResult {
  project: string;
  fingerprint: string;
  hasChangedSinceLastSnapshot: boolean;
  changes: InventoryChange[];
  retention: Retention;
  pieces: CompactPiece[];
  notes: string[];
}

export type EvidenceResult = Signal & { generatedAt: string };

export interface StatusResult {
  version: string;
  project: string;
  provider: string;
  node: string;
  transcripts: AvailableHistory;
  retention: Retention;
  pieces: Record<string, number>;
  suggestions: Record<string, number>;
  dataDir: string;
  config: Config;
}
