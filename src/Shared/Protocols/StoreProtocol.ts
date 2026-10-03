import type { Inventory } from "./HarnessProtocol.js";
import type { SessionFacts } from "./SessionProtocol.js";

export interface CachedFacts {
  signature: string;
  facts: SessionFacts;
}

export interface FactsCache {
  version: number;
  fileToEntry: Record<string, CachedFacts | undefined>;
}

export interface SavedInventory {
  previous?: Inventory;
  hasChanged: boolean;
}
