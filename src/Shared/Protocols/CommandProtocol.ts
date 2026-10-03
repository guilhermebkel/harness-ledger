import type { AvailableHistory } from "@/Shared/Protocols/AnalysisProtocol.ts";
import type { Config } from "@/Shared/Protocols/ConfigProtocol.ts";
import type { CompactPiece, InventoryChange, Retention } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { ProviderType } from "@/Shared/Protocols/ProviderProtocol.ts";
import type { Signal } from "@/Shared/Protocols/SignalProtocol.ts";
import type { SuggestionStatus } from "@/Shared/Protocols/SuggestionProtocol.ts";

export interface CommonOptions {
  projectDir?: string;
  dataDir?: string;
  provider?: ProviderType;
  isProjectOnly?: boolean;
  shouldReadAllProjects?: boolean;
  shouldSkipCache?: boolean;
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
  changedAt?: string;
  since?: string;
}

export interface EvidenceOptions extends CommonOptions {
  signalId: string;
  maxEvidence?: number;
}

export interface IssueOptions extends CommonOptions {
  signalId: string;
  note: string;
}

export interface ListSuggestionsOptions extends CommonOptions { status?: SuggestionStatus }

export interface AddSuggestionsOptions extends CommonOptions { items: unknown }

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
  pieceKindToCount: Record<string, number>;
  suggestionStatusToCount: Record<string, number>;
  dataDir: string;
  config: Config;
}
