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

// Why: each provider reads its own formats and returns the shared model; nothing outside its folder knows those formats (ADR 0008).
export abstract class BaseProviderAdapter {
  abstract readonly type: ProviderType;

  abstract readonly displayName: string;

  abstract paths(): ProviderPaths;

  // Why: only stats files; parsing happens later, for new or changed transcripts only.
  abstract discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]>;

  abstract parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts>;

  abstract takeInventory(options: InventoryOptions): Promise<Inventory>;

  retentionNote(retentionDays: number): string {
    return `${this.displayName} deletes transcripts older than ${retentionDays} days. `
      + "improve-my-harness never changes this setting.";
  }
}
