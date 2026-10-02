import type { ChangePoint, CompareResult } from "../Protocols/AnalysisProtocol.js";
import type { CompareOptions } from "../Protocols/CommandProtocol.js";
import { CompareService } from "../Services/CompareService.js";
import { ContextService } from "../Services/ContextService.js";
import { TimeUtil } from "../Utils/TimeUtil.js";

/** `imh compare --piece <id>`: before/after metrics for one piece. */
export class CompareCommand {
  async run(options: CompareOptions): Promise<CompareResult> {
    const context = await ContextService.create(options);
    const changePoint = await this.findChangePoint(context, options);
    if (!changePoint) {
      throw new Error(`Don't know when ${options.piece} changed. Pass --at <date>.`);
    }
    const loaded = await context.loadSessions({ periodStartAtMs: TimeUtil.parsePointInTime(options.since) });
    return new CompareService(context.config, context.idleMs).compare(
      loaded.sessions,
      options.piece,
      changePoint.changedAtMs,
      changePoint.source,
    );
  }

  /** `--at` first, then the last applied suggestion for the piece, then the piece's last change. */
  private async findChangePoint(context: ContextService, options: CompareOptions): Promise<ChangePoint | undefined> {
    const explicitAtMs = TimeUtil.parsePointInTime(options.changedAt);
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
    const inventory = await context.takeInventory();
    const piece = inventory.pieces.find((candidate) => candidate.id === options.piece);
    if (!piece?.modifiedAt) {
      return undefined;
    }
    return {
      changedAtMs: Date.parse(piece.modifiedAt),
      source: `${piece.path} last changed (${piece.modifiedSource ?? "unknown"})`,
    };
  }
}
