import { BaseProviderAdapter } from "../../../Shared/Adapters/BaseProviderAdapter.js";
import type { Inventory } from "../../../Shared/Protocols/HarnessProtocol.js";
import type {
  DiscoverOptions,
  InventoryOptions,
  ParseOptions,
  ProviderPaths,
  ProviderType,
  TranscriptFile,
} from "../../../Shared/Protocols/ProviderProtocol.js";
import type { SessionFacts } from "../../../Shared/Protocols/SessionProtocol.js";
import { ClaudeCodeInventoryService } from "../Services/ClaudeCodeInventoryService.js";
import { ClaudeCodeSessionService } from "../Services/ClaudeCodeSessionService.js";
import { ClaudeCodePathUtil } from "../Utils/ClaudeCodePathUtil.js";

/** Claude Code: transcripts in `~/.claude/projects/`, harness in CLAUDE.md, `.claude/`, `.mcp.json` and plugins. */
export class ClaudeCodeProviderAdapter extends BaseProviderAdapter {
  readonly type: ProviderType = "claude-code";
  readonly displayName = "Claude Code";

  paths(): ProviderPaths {
    return { homeDir: ClaudeCodePathUtil.homeDir() };
  }

  async discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]> {
    return this.sessionService().discoverTranscripts(options);
  }

  async parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts> {
    return this.sessionService().parseSession(transcript, options);
  }

  async takeInventory(options: InventoryOptions): Promise<Inventory> {
    const inventoryService = new ClaudeCodeInventoryService(this.paths().homeDir, ClaudeCodePathUtil.claudeJsonPath());
    return inventoryService.takeInventory(options);
  }

  override retentionNote(retentionDays: number): string {
    return `Claude Code deletes transcripts older than ${retentionDays} days at startup. `
      + "improve-my-harness never changes this setting.";
  }

  /** Paths are resolved on every call, so an environment change (as in tests) is picked up. */
  private sessionService(): ClaudeCodeSessionService {
    return new ClaudeCodeSessionService(this.paths().homeDir);
  }
}
