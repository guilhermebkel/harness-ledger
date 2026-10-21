import { homedir } from "node:os";
import { join } from "node:path";
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
import { CodexInventoryService } from "@/Providers/Codex/Services/CodexInventoryService.ts";
import { CodexSessionService } from "@/Providers/Codex/Services/CodexSessionService.ts";
import { CodexPathUtil } from "@/Providers/Codex/Utils/CodexPathUtil.ts";

export class CodexProviderAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "codex";
  readonly displayName = "Codex";

  paths(): ProviderPaths {
    return { homeDir: CodexPathUtil.homeDir() };
  }

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    return this.sessionService().discoverTranscripts(options);
  }

  async parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts> {
    return this.sessionService().parseSession(transcript, options);
  }

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const userAgentsDir = CodexPathUtil.userAgentsDir(homedir());
    const userSkillsDir = join(userAgentsDir, "skills");
    const inventoryService = new CodexInventoryService(this.paths().homeDir, userSkillsDir);
    return inventoryService.takeInventory(options);
  }

  override retentionNote(): string {
    return "Codex keeps session transcripts until they are deleted, so no retention window applies. "
      + "harness-ledger never changes this setting.";
  }

  private sessionService(): CodexSessionService {
    // Why: built on every call, so an environment change (as in tests) is picked up.
    return new CodexSessionService(this.paths().homeDir);
  }
}
