// Local state in <project>/.imh/. Only derived data lives here: redacted facts, inventory
// snapshots, suggestion status and the last analysis (ADR 0007). Transcripts are read in
// place and never copied.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseJson } from "../core/guards.js";
import type { Inventory, SessionFacts } from "../core/types.js";

/** Bump when the parser's output shape changes, so cached facts are re-parsed. */
export const FACTS_VERSION = 2;

const DATA_DIR_NAME = ".imh";
const JSON_INDENT = 2;
const FACTS_CACHE_FILE = "cache/facts.json";
const LATEST_INVENTORY_FILE = "inventory/latest.json";
const SUGGESTIONS_FILE = "suggestions.json";

export interface CachedFacts {
  /** Changes when the transcript (or any of its subagent transcripts) changes. */
  signature: string;
  facts: SessionFacts;
}

export interface FactsCache {
  version: number;
  fileToEntry: Record<string, CachedFacts | undefined>;
}

export const FINDING_CLASSES = [
  "rule_ignored",
  "partial_instruction",
  "missing_instruction",
  "structure_change",
  "out_of_scope",
  "already_handled",
] as const;

export type FindingClass = (typeof FINDING_CLASSES)[number];

export const SUGGESTION_STATUSES = ["pending", "accepted", "rejected", "applied"] as const;

export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export interface Suggestion {
  /** Derived from the signal ids and the piece, so the same problem never gets two ids. */
  id: string;
  title: string;
  class: FindingClass;
  /** Piece id, e.g. "agent:code-reviewer". */
  piece?: string;
  /** Signal ids the suggestion came from, e.g. "failed_command:npm test". */
  signals: string[];
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  /** Harness fingerprint right after the suggestion was applied, for before/after. */
  appliedFingerprint?: string;
  note?: string;
  /** Redacted summary of the proposed change. */
  change?: string;
}

export interface SavedInventory {
  previous?: Inventory;
  hasChanged: boolean;
}

export class Store {
  constructor(readonly root: string) {}

  static forProject(projectDir: string, dataDir?: string): Store {
    return new Store(dataDir ?? join(projectDir, DATA_DIR_NAME));
  }

  /**
   * Reads a file this tool wrote. Its shape is trusted because only this tool writes it;
   * files people may edit by hand (config.json) are validated by their reader.
   */
  async readJson<Shape>(relativePath: string): Promise<Shape | undefined> {
    const text = await readFile(join(this.root, relativePath), "utf8").catch(() => undefined);
    return text === undefined ? undefined : (parseJson(text) as Shape | undefined);
  }

  /** Writes atomically (temp file + rename), so a crash never leaves a half-written file. */
  async writeJson(relativePath: string, value: unknown, shouldIndent = true): Promise<void> {
    const file = join(this.root, relativePath);
    await mkdir(dirname(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(value, null, shouldIndent ? JSON_INDENT : 0));
    await rename(temporaryFile, file);
  }

  async loadFactsCache(): Promise<FactsCache> {
    const cache = await this.readJson<FactsCache>(FACTS_CACHE_FILE);
    const isCurrent = cache?.version === FACTS_VERSION;
    return isCurrent
      ? cache
      : {
          version: FACTS_VERSION,
          fileToEntry: {},
        };
  }

  async saveFactsCache(cache: FactsCache): Promise<void> {
    await this.writeJson(FACTS_CACHE_FILE, cache, false);
  }

  /** Always updates the latest inventory; keeps a dated snapshot only when the harness changed. */
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
