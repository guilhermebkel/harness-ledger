import type { CommonOptions, InventoryResult } from "../Protocols/CommandProtocol.js";
import { ContextService } from "../Services/ContextService.js";
import { InventoryService } from "../Services/InventoryService.js";

/** `imh inventory`: maps the active harness; a dated snapshot is kept only when something changed. */
export class InventoryCommand {
  async run(options: CommonOptions): Promise<InventoryResult> {
    const context = await ContextService.create(options);
    const inventory = await context.takeInventory();
    const { previous, hasChanged } = await context.store.saveInventory(inventory);
    return {
      project: context.projectDir,
      fingerprint: inventory.fingerprint,
      hasChangedSinceLastSnapshot: hasChanged,
      changes: InventoryService.diff(previous, inventory),
      retention: inventory.retention,
      pieces: inventory.pieces.map((piece) => InventoryService.compactPiece(piece)),
      notes: inventory.notes,
    };
  }
}
