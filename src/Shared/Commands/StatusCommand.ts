import type { CommonOptions, StatusResult } from "@/Shared/Protocols/CommandProtocol.js";
import { ContextService } from "@/Shared/Services/ContextService.js";
import { CollectionUtil } from "@/Shared/Utils/CollectionUtil.js";
import { VersionUtil } from "@/Shared/Utils/VersionUtil.js";

export class StatusCommand {
  async run(options: CommonOptions): Promise<StatusResult> {
    const context = await ContextService.create(options);
    const inventory = await context.takeInventory();
    const loaded = await context.loadSessions();
    const suggestions = await context.store.loadSuggestions();
    return {
      version: VersionUtil.VERSION,
      project: context.projectDir,
      provider: context.provider.type,
      node: process.version,
      transcripts: loaded.available,
      retention: inventory.retention,
      pieces: CollectionUtil.countBy(inventory.pieces.map((piece) => piece.kind)),
      suggestions: CollectionUtil.countBy(suggestions.map((suggestion) => suggestion.status)),
      dataDir: context.store.root,
      config: context.config,
    };
  }
}
