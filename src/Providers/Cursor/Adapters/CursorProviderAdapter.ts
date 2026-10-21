import { BaseProviderAdapter } from "@/Shared/Adapters/BaseProviderAdapter.ts";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type {
  DiscoverOptions,
  InventoryOptions,
  ProviderPaths,
  ProviderType,
  TranscriptFile,
} from "@/Shared/Protocols/ProviderProtocol.ts";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.ts";
import { CursorInventoryService } from "@/Providers/Cursor/Services/CursorInventoryService.ts";
import { CursorSessionService } from "@/Providers/Cursor/Services/CursorSessionService.ts";
import { CursorPathUtil } from "@/Providers/Cursor/Utils/CursorPathUtil.ts";

export class CursorProviderAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "cursor";
  readonly displayName = "Cursor";

  paths(): ProviderPaths {
    return { homeDir: CursorPathUtil.homeDir() };
  }

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    return this.sessionService().discoverTranscripts(options);
  }

  async parseSession(transcript: TranscriptFile): Promise<SessionFacts> {
    return this.sessionService().parseSession(transcript);
  }

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    return new CursorInventoryService(this.paths().homeDir).takeInventory(options);
  }

  override retentionNote(): string {
    return "Cursor keeps session transcripts until they are deleted, so no retention window applies. "
      + "harness-ledger never changes this setting.";
  }

  private sessionService(): CursorSessionService {
    // Why: built on every call, so an environment change (as in tests) is picked up.
    return new CursorSessionService(this.paths().homeDir);
  }
}
