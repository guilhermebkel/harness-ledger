import { takeInventory } from "../adapters/claude-code/inventory.js";
import { comparePiece, type CompareResult } from "../analysis/compare.js";
import { parsePointInTime } from "../core/time.js";
import { createContext, loadProjectSessions, type CommandContext, type CommonOptions } from "./context.js";

export interface CompareOptions extends CommonOptions {
  piece: string;
  /** When the piece changed. Defaults to an applied suggestion's date, then the piece's last change. */
  changedAt?: string;
  since?: string;
}

interface ChangePoint {
  changedAtMs: number;
  source: string;
}

/** Before/after metrics for one piece. */
export async function runCompare(options: CompareOptions): Promise<CompareResult> {
  const context = await createContext(options);
  const changePoint = await findChangePoint(context, options);
  if (!changePoint) {
    throw new Error(`Don't know when ${options.piece} changed. Pass --at <date>.`);
  }
  const loaded = await loadProjectSessions(context, options, { periodStartAtMs: parsePointInTime(options.since) });
  return comparePiece(loaded.sessions, options.piece, changePoint.changedAtMs, changePoint.source, {
    minSessions: context.config.minSessionsCompare,
    minRelativeChange: context.config.minRelativeChange,
    prices: context.config.prices,
    idleMs: context.idleMs,
    thresholds: context.config.signalThresholds,
  });
}

async function findChangePoint(context: CommandContext, options: CompareOptions): Promise<ChangePoint | undefined> {
  const explicitAtMs = parsePointInTime(options.changedAt);
  if (explicitAtMs !== undefined) {
    return {
      changedAtMs: explicitAtMs,
      source: "--at",
    };
  }
  const lastApplied = (await context.store.loadSuggestions())
    .filter((suggestion) => suggestion.piece === options.piece && suggestion.appliedAt !== undefined)
    .sort((left, right) => (right.appliedAt ?? "").localeCompare(left.appliedAt ?? ""))[0];
  if (lastApplied?.appliedAt) {
    return {
      changedAtMs: Date.parse(lastApplied.appliedAt),
      source: `suggestion ${lastApplied.id} applied`,
    };
  }
  const inventory = await takeInventory({
    projectDir: context.projectDir,
    isProjectOnly: options.isProjectOnly,
  });
  const piece = inventory.pieces.find((candidate) => candidate.id === options.piece);
  if (!piece?.modifiedAt) {
    return undefined;
  }
  return {
    changedAtMs: Date.parse(piece.modifiedAt),
    source: `${piece.path} last changed (${piece.modifiedSource ?? "unknown"})`,
  };
}
