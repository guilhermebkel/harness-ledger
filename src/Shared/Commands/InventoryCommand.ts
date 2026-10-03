import type { CommonOptions, InventoryResult } from "@/Shared/Protocols/CommandProtocol.ts";
import { ContextService } from "@/Shared/Services/ContextService.ts";
import { InventoryService } from "@/Shared/Services/InventoryService.ts";

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
