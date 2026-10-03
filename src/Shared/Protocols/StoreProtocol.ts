import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";

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
