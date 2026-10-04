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

export abstract class BaseProviderAdapter {
  abstract readonly type: ProviderType;

  abstract readonly displayName: string;

  abstract paths(): ProviderPaths;

  abstract discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]>;

  abstract parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts>;

  abstract takeInventory(options: InventoryOptions): Promise<Inventory>;

  retentionNote(retentionDays: number): string {
    return `${this.displayName} deletes transcripts older than ${retentionDays} days. `
      + "harness-ledger never changes this setting.";
  }
}
