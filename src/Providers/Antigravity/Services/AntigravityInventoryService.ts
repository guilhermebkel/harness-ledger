import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { InventoryOptions } from "@/Shared/Protocols/ProviderProtocol.ts";
import { PieceFileUtil } from "@/Shared/Utils/PieceFileUtil.ts";

export class AntigravityInventoryService {
  constructor(private readonly homeDir: string) {}

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const { projectDir } = options;
    return Promise.resolve({
      projectDir,
      fingerprint: PieceFileUtil.fingerprint([]),
      provider: "antigravity",
      takenAt: new Date().toISOString(),
      pieces: [],
      retention: { days: 0, source: "Antigravity keeps transcripts until they are deleted" },
      notes: [],
    });
  }
}
