// Local state in <project>/.imh/. Only derived data lives here: redacted facts,
// inventory snapshots, suggestion status and the last analysis. Transcripts are
// read in place and never copied.

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Inventory, SessionFacts } from "../core/types.js";

/** Bump when the parser output changes, to invalidate cached facts. */
export const FACTS_VERSION = 1;

export class Store {
  constructor(readonly root: string) {}

  static forProject(projectDir: string, dataDir?: string): Store {
    return new Store(dataDir ?? join(projectDir, ".imh"));
  }

  path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  async readJson<T>(rel: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.path(rel), "utf8")) as T;
    } catch {
      return undefined;
    }
  }

  async writeJson(rel: string, value: unknown, pretty = true): Promise<void> {
    const file = this.path(rel);
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, pretty ? 2 : 0));
    await rename(tmp, file);
  }

  // ---- facts cache -------------------------------------------------------

  async loadFactsCache(): Promise<FactsCache> {
    const c = await this.readJson<FactsCache>("cache/facts.json");
    return c && c.version === FACTS_VERSION ? c : { version: FACTS_VERSION, entries: {} };
  }

  async saveFactsCache(cache: FactsCache): Promise<void> {
    await this.writeJson("cache/facts.json", cache, false);
  }

  // ---- inventory snapshots ----------------------------------------------

  async latestInventory(): Promise<Inventory | undefined> {
    return this.readJson<Inventory>("inventory/latest.json");
  }

  /** Saves a snapshot when the harness changed. Returns the previous snapshot, if any. */
  async saveInventory(inv: Inventory): Promise<{ previous?: Inventory; changed: boolean }> {
    const previous = await this.latestInventory();
    const changed = !previous || previous.fingerprint !== inv.fingerprint;
    if (changed) {
      const stamp = inv.takenAt.replace(/[:.]/g, "-");
      await this.writeJson(`inventory/${stamp}.json`, inv);
    }
    await this.writeJson("inventory/latest.json", inv);
    return { previous, changed };
  }

  async inventoryHistory(): Promise<Inventory[]> {
    const files = (await readdir(this.path("inventory")).catch(() => [] as string[]))
      .filter((f) => f.endsWith(".json") && f !== "latest.json")
      .sort();
    const out: Inventory[] = [];
    for (const f of files) {
      const inv = await this.readJson<Inventory>(`inventory/${f}`);
      if (inv) out.push(inv);
    }
    return out;
  }

  // ---- suggestions -------------------------------------------------------

  async suggestions(): Promise<Suggestion[]> {
    return (await this.readJson<Suggestion[]>("suggestions.json")) ?? [];
  }

  async saveSuggestions(list: Suggestion[]): Promise<void> {
    await this.writeJson("suggestions.json", list);
  }
}

export interface FactsCache {
  version: number;
  entries: Record<string, { signature: string; facts: SessionFacts }>;
}

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "applied";

export interface Suggestion {
  /** Stable id: derived from the signal key and piece, so the same problem never gets two ids. */
  id: string;
  title: string;
  /** One of the finding classes (see skills/improve-my-harness/references/findings.md). */
  class: string;
  /** Harness piece id, e.g. "agent:code-reviewer". */
  piece?: string;
  /** Signal ids this suggestion came from (e.g. "failed_command:npm test"). */
  signals: string[];
  status: SuggestionStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  /** Harness fingerprint when the suggestion was applied, for before/after. */
  appliedFingerprint?: string;
  note?: string;
  /** Redacted summary of the proposed change. */
  change?: string;
}
