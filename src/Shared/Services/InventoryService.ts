import type { CompactPiece, HarnessPiece, Inventory, InventoryChange } from "@/Shared/Protocols/HarnessProtocol.js";

/** Operations on inventories that don't depend on the provider that produced them. */
export class InventoryService {
  /** Enough to identify and locate a piece, without hashes and sizes. */
  static compactPiece(piece: HarnessPiece): CompactPiece {
    return {
      id: piece.id,
      scope: piece.scope,
      path: piece.path,
      approxTokens: piece.approxTokens || undefined,
      modifiedAt: piece.modifiedAt,
      isEditable: piece.isEditable,
      model: piece.model,
      description: piece.description?.slice(0, InventoryService.MAX_COMPACT_DESCRIPTION_CHARS),
    };
  }

  private static readonly MAX_COMPACT_DESCRIPTION_CHARS = 120;

  static diff(previous: Inventory | undefined, current: Inventory): InventoryChange[] {
    if (!previous) {
      return [];
    }
    const previousIdToHash = new Map(previous.pieces.map((piece) => [piece.id, piece.hash]));
    const currentIdToHash = new Map(current.pieces.map((piece) => [piece.id, piece.hash]));
    const changes: InventoryChange[] = [];
    for (const [id, hash] of currentIdToHash) {
      const previousHash = previousIdToHash.get(id);
      if (previousHash === undefined) {
        changes.push({
          id,
          change: "added",
        });
      } else if (previousHash !== hash) {
        changes.push({
          id,
          change: "modified",
        });
      }
    }
    for (const id of previousIdToHash.keys()) {
      if (!currentIdToHash.has(id)) {
        changes.push({
          id,
          change: "removed",
        });
      }
    }
    return changes;
  }
}
