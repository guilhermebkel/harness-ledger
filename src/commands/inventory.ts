import { takeInventory } from "../adapters/claude-code/inventory.js";
import type { Retention } from "../core/types.js";
import {
  compactPiece,
  createContext,
  diffInventories,
  type CommonOptions,
  type CompactPiece,
  type InventoryChange,
} from "./context.js";

export interface InventoryResult {
  project: string;
  fingerprint: string;
  hasChangedSinceLastSnapshot: boolean;
  changes: InventoryChange[];
  retention: Retention;
  pieces: CompactPiece[];
  notes: string[];
}

/** Maps the active harness; a dated snapshot is kept only when something changed. */
export async function runInventory(options: CommonOptions): Promise<InventoryResult> {
  const context = await createContext(options);
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly,
  });
  const { previous, hasChanged } = await context.store.saveInventory(inventory);
  return {
    project: context.projectDir,
    fingerprint: inventory.fingerprint,
    hasChangedSinceLastSnapshot: hasChanged,
    changes: diffInventories(previous, inventory),
    retention: inventory.retention,
    pieces: inventory.pieces.map(compactPiece),
    notes: inventory.notes,
  };
}
