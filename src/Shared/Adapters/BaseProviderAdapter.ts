import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.js";
import type {
  DiscoverOptions,
  InventoryOptions,
  ParseOptions,
  ProviderPaths,
  ProviderType,
  TranscriptFile,
} from "@/Shared/Protocols/ProviderProtocol.js";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.js";

/**
 * What every provider (an agentic coding tool such as Claude Code) must offer. Each provider
 * extends this class in `src/Providers/<Provider>/Adapters/`, reads its own formats and returns
 * the shared model. Nothing outside a provider's folder knows those formats (ADR 0005, ADR 0008).
 */
export abstract class BaseProviderAdapter {
  abstract readonly type: ProviderType;

  /** Display name used in reports, e.g. "Claude Code". */
  abstract readonly displayName: string;

  /** Where the provider keeps transcripts and user-level configuration. */
  abstract paths(): ProviderPaths;

  /** Lists transcript files for a project. Only stats files; nothing is parsed. */
  abstract discoverTranscripts(options: DiscoverOptions): Promise<TranscriptFile[]>;

  /** Reads one session (main transcript and subagent transcripts) into the shared model. */
  abstract parseSession(transcript: TranscriptFile, options: ParseOptions): Promise<SessionFacts>;

  /** Maps the pieces of the harness active for a project right now. */
  abstract takeInventory(options: InventoryOptions): Promise<Inventory>;

  /** A sentence about the provider's own transcript retention, for reports. */
  retentionNote(retentionDays: number): string {
    return `${this.displayName} deletes transcripts older than ${retentionDays} days. `
      + "improve-my-harness never changes this setting.";
  }
}
