import { resolve } from "node:path";
import { loadSessions, type LoadResult } from "../analysis/load.js";
import { MS_PER_MINUTE } from "../core/time.js";
import type { HarnessPiece, Inventory } from "../core/types.js";
import { loadConfig, type Config } from "../state/config.js";
import { Store } from "../state/store.js";

declare const __IMH_VERSION__: string | undefined;

/** Replaced by the package version at build time; "dev" when running from source. */
export const VERSION = typeof __IMH_VERSION__ === "string" ? __IMH_VERSION__ : "dev";

const MAX_COMPACT_DESCRIPTION_CHARS = 120;

/** Options every command accepts. */
export interface CommonOptions {
  projectDir?: string;
  dataDir?: string;
  isProjectOnly?: boolean;
  shouldReadAllProjects?: boolean;
  shouldSkipCache?: boolean;
  /** Session ids to leave out, such as the session running the analysis. */
  excludedSessionIds?: string[];
}

export interface CommandContext {
  projectDir: string;
  store: Store;
  config: Config;
  idleMs: number;
}

export async function createContext(options: CommonOptions): Promise<CommandContext> {
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const store = Store.forProject(projectDir, options.dataDir);
  const config = await loadConfig(store);
  return {
    projectDir,
    store,
    config,
    idleMs: config.idleMinutes * MS_PER_MINUTE,
  };
}

export interface Period {
  periodStartAtMs?: number;
  periodEndAtMs?: number;
}

export async function loadProjectSessions(
  context: CommandContext,
  options: CommonOptions,
  period: Period = {},
): Promise<LoadResult> {
  return loadSessions({
    projectDir: context.projectDir,
    shouldReadAllProjects: options.shouldReadAllProjects,
    ...period,
    idleMs: context.idleMs,
    store: context.store,
    shouldSkipCache: options.shouldSkipCache,
    excludedSessionIds: options.excludedSessionIds,
  });
}

type CompactPieceFields = "id" | "scope" | "path" | "modifiedAt" | "isEditable" | "model" | "description";

export interface CompactPiece extends Pick<HarnessPiece, CompactPieceFields> {
  /** Left out for pieces without text (hooks, MCP servers, settings). */
  approxTokens?: number;
}

/** Enough to identify and locate a piece, without the hashes and sizes. */
export function compactPiece(piece: HarnessPiece): CompactPiece {
  return {
    id: piece.id,
    scope: piece.scope,
    path: piece.path,
    approxTokens: piece.approxTokens || undefined,
    modifiedAt: piece.modifiedAt,
    isEditable: piece.isEditable,
    model: piece.model,
    description: piece.description?.slice(0, MAX_COMPACT_DESCRIPTION_CHARS),
  };
}

export type PieceChangeKind = "added" | "removed" | "modified";

export interface InventoryChange {
  id: string;
  change: PieceChangeKind;
}

export function diffInventories(previous: Inventory | undefined, current: Inventory): InventoryChange[] {
  if (!previous) {
    return [];
  }
  const previousIdToHash = new Map(previous.pieces.map((piece) => [piece.id, piece.hash]));
  const currentIdToHash = new Map(current.pieces.map((piece) => [piece.id, piece.hash]));
  const changes: InventoryChange[] = [];
  for (const [id, hash] of currentIdToHash) {
    const previousHash = previousIdToHash.get(id);
    if (previousHash === undefined) {
      changes.push({
        id,
        change: "added",
      });
    } else if (previousHash !== hash) {
      changes.push({
        id,
        change: "modified",
      });
    }
  }
  for (const id of previousIdToHash.keys()) {
    if (!currentIdToHash.has(id)) {
      changes.push({
        id,
        change: "removed",
      });
    }
  }
  return changes;
}
