import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Inventory } from "@/Shared/Protocols/HarnessProtocol.ts";
import type { FactsCache, SavedInventory } from "@/Shared/Protocols/StoreProtocol.ts";
import type { Suggestion } from "@/Shared/Protocols/SuggestionProtocol.ts";
import { GuardUtil } from "@/Shared/Utils/GuardUtil.ts";

const DATA_DIR_NAME = ".imh";
const JSON_INDENT = 2;
const FACTS_CACHE_FILE = "cache/facts.json";
const LATEST_INVENTORY_FILE = "inventory/latest.json";
const SUGGESTIONS_FILE = "suggestions.json";

export class StoreService {
  // Why: bump when the parser's output shape changes, so cached facts are re-parsed.
  static readonly FACTS_VERSION = 5;

  constructor(readonly root: string) {}

  static forProject(projectDir: string, dataDir?: string): StoreService {
    return new StoreService(dataDir ?? join(projectDir, DATA_DIR_NAME));
  }

  async readJson<Shape>(relativePath: string): Promise<Shape | undefined> {
    const text = await readFile(join(this.root, relativePath), "utf8").catch(() => undefined);
    // Why: only this tool writes these files, so their shape is trusted; files people edit by hand (config.json) are
    // validated by their reader.
    return text === undefined ? undefined : (GuardUtil.parseJson(text) as Shape | undefined);
  }

  async writeJson(relativePath: string, value: unknown, shouldIndent = true): Promise<void> {
    const file = join(this.root, relativePath);
    await mkdir(dirname(file), { recursive: true });
    // Why: written to a temporary file and renamed, so a crash never leaves a half-written file.
    const temporaryFile = `${file}.${process.pid}.tmp`;
    const serialized = JSON.stringify(value, null, shouldIndent ? JSON_INDENT : 0);
    await writeFile(temporaryFile, serialized);
    await rename(temporaryFile, file);
  }

  async loadFactsCache(): Promise<FactsCache> {
    const cache = await this.readJson<FactsCache>(FACTS_CACHE_FILE);
    const isCurrent = cache?.version === StoreService.FACTS_VERSION;
    return isCurrent ? cache : StoreService.emptyFactsCache();
  }

  static emptyFactsCache(): FactsCache {
    return {
      version: StoreService.FACTS_VERSION,
      fileToEntry: {},
    };
  }

  async saveFactsCache(cache: FactsCache): Promise<void> {
    await this.writeJson(FACTS_CACHE_FILE, cache, false);
  }

  async saveInventory(inventory: Inventory): Promise<SavedInventory> {
    const previous = await this.readJson<Inventory>(LATEST_INVENTORY_FILE);
    const hasChanged = previous?.fingerprint !== inventory.fingerprint;
    if (hasChanged) {
      const fileSafeTakenAt = inventory.takenAt.replace(/[:.]/g, "-");
      await this.writeJson(`inventory/${fileSafeTakenAt}.json`, inventory);
    }
    await this.writeJson(LATEST_INVENTORY_FILE, inventory);
    return {
      previous,
      hasChanged,
    };
  }

  async loadSuggestions(): Promise<Suggestion[]> {
    return (await this.readJson<Suggestion[]>(SUGGESTIONS_FILE)) ?? [];
  }

  async saveSuggestions(suggestions: Suggestion[]): Promise<void> {
    await this.writeJson(SUGGESTIONS_FILE, suggestions);
  }
}
