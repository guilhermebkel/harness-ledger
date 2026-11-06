import { BaseProviderAdapter } from "@/Shared/Adapters/BaseProviderAdapter.ts";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type {
  DiscoverOptions,
  InventoryOptions,
  ParseOptions,
  ProviderPaths,
  ProviderType,
  TranscriptFile,
} from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import { AntigravityInventoryService } from "@/Providers/Antigravity/Services/AntigravityInventoryService.ts";
import { AntigravitySessionService } from "@/Providers/Antigravity/Services/AntigravitySessionService.ts";
import { AntigravityPathUtil } from "@/Providers/Antigravity/Utils/AntigravityPathUtil.ts";

export class AntigravityProviderAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "antigravity";
  readonly displayName = "Antigravity";

  paths(): ProviderPaths {
    return { homeDir: AntigravityPathUtil.homeDir() };
  }

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    const service = new AntigravitySessionService(this.paths().homeDir);
    return service.discoverTranscripts(options);
  }

  async parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts> {
    const service = new AntigravitySessionService(this.paths().homeDir);
    return service.parseSession(transcript, options);
  }

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const inventoryService = new AntigravityInventoryService(this.paths().homeDir);
    return inventoryService.takeInventory(options);
  }

  override retentionNote(): string {
    return "Antigravity keeps session transcripts until they are deleted, so no retention window applies. "
      + "harness-ledger never changes this setting.";
  }
}
